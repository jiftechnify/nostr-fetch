import { Channel } from "@nostr-fetch/kernel/channel";
import type {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBackend,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { emptyAsyncGen } from "@nostr-fetch/kernel/utils";

import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import { RelayPool, initRelayPool } from "./relayPool";

/**
 * Default implementation of `NostrFetchBackend`.
 */
export class DefaultFetcherBackend implements NostrFetcherBackend {
  #relayPool: RelayPool;
  #debugLogger: DebugLogger | undefined;

  public constructor(commonOpts: Required<NostrFetcherCommonOptions>) {
    this.#relayPool = initRelayPool(commonOpts);
    if (commonOpts.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(commonOpts.minLogLevel);
    }
  }

  /**
   * Ensures connections to the relays prior to an event subscription.
   *
   * Returns URLs of relays *successfully connected to*.
   *
   * It should *normalize* the passed `relayUrls` before establishing connections to relays.
   */
  public async ensureRelays(relayUrls: string[], options: EnsureRelaysOptions): Promise<string[]> {
    return this.#relayPool.ensureRelays(relayUrls, options);
  }

  /**
   * Closes all the connections to relays and clean up the internal relay pool.
   */
  public shutdown(): void {
    this.#relayPool.shutdown();
  }

  /**
   * Fetches Nostr events matching `filters` from the relay specified by `relayUrl` until EOSE.
   *
   * The result is an `AsyncIterable` of Nostr events.
   * You can think that it's an asynchronous channel which conveys events.
   * The channel will be closed once EOSE is reached.
   *
   * If no connection to the specified relay has been established at the time this function is called, it will return an empty channel.
   */
  public fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const logger = this.#debugLogger?.subLogger(relayUrl);

    const relay = this.#relayPool.getRelayIfConnected(relayUrl);
    if (relay === undefined) {
      return emptyAsyncGen();
    }

    const [tx, chIter] = Channel.make<NostrEvent>();

    // relay error handlings
    const onNotice = (n: unknown) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));
      try {
        sub.close();
      } catch (err) {
        logger?.log("error", `failed to close subscription (id: ${sub.subId}): ${err}`);
      }
      removeRelayListeners();
    };
    const onError = () => {
      // WebSocket error closes the connection, so calling close() is meaningless
      tx.error(Error("ERROR"));
      removeRelayListeners();
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
      relay.off("error", onError);
    };

    relay.on("notice", onNotice);
    relay.on("error", onError);

    // prepare a subscription
    const sub = relay.prepareSub([filter], options);

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
    });
    sub.on("eose", ({ aborted }) => {
      if (aborted) {
        logger?.log("info", `subscription (id: ${sub.subId}) aborted before EOSE due to timeout`);
      }
      closeSub();
    });

    // common process to close subscription
    const closeSub = () => {
      try {
        sub.close();
      } catch (err) {
        logger?.log("error", `failed to close subscription (id: ${sub.subId}): ${err}`);
      }
      tx.close();
      removeRelayListeners();
      logger?.log("verbose", `CLOSE: subId=${options.subId ?? "<auto>"}`);
    };

    // start the subscription
    logger?.log("verbose", `REQ: subId=${options.subId ?? "<auto>"}, filter=%O`, filter);
    try {
      sub.req();
    } catch (err) {
      tx.error(err);
      removeRelayListeners();
    }

    // handle abortion
    if (options.abortSignal?.aborted) {
      logger?.log("info", `subscription (id: ${sub.subId}) aborted by AbortController`);
      closeSub();
    }
    options.abortSignal?.addEventListener("abort", () => {
      logger?.log("info", `subscription (id: ${sub.subId}) aborted by AbortController`);
      closeSub();
    });

    return chIter;
  }
}
