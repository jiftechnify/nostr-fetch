import { Channel } from "@nostr-fetch/kernel/channel";
import {
  FetchTillEoseAbortedSignal,
  FetchTillEoseFailedSignal,
  type EnsureRelaysOptions,
  type FetchTillEoseOptions,
  type NostrFetcherBackend,
  type NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";

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
   * If one of the following situations occurs, it is regarded as "failure".
   * In such a case, it should throw `FetchTillEoseFailedSignal`.
   *
   * - It couldn't establish connection to the relay
   * - Received a NOTICE message during the fetch
   * - A WebSocket error occurred during the fetch
   *
   * If the fetch was aborted (due to AbortController or auto abortion timer), it should throw `FetchTillEoseAbortedSignal`.
   */
  public async *fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const logger = this.#debugLogger?.subLogger(relayUrl);

    const relay = await this.#relayPool.ensureSingleRelay(relayUrl, options);
    if (relay === undefined) {
      throw new FetchTillEoseFailedSignal("failed to ensure connection to the relay");
    }

    const [tx, chIter] = Channel.make<NostrEvent>();

    // relay error handlings
    const onNotice = (n: unknown) => {
      try {
        sub.close();
      } catch (err) {
        logger?.log("error", `failed to close subscription (id: ${sub.subId}): ${err}`);
      }
      removeRelayListeners();
      tx.error(new FetchTillEoseFailedSignal(`NOTICE: ${JSON.stringify(n)}`));
    };
    const onError = () => {
      // WebSocket error closes the connection, so calling close() is meaningless
      removeRelayListeners();
      tx.error(new FetchTillEoseFailedSignal("WebSocket error"));
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
      closeSub();
      if (aborted) {
        tx.error(
          new FetchTillEoseAbortedSignal(
            `subscription (id: ${sub.subId}) aborted before EOSE due to timeout`
          )
        );
      } else {
        tx.close();
      }
    });

    // common process to close subscription
    const closeSub = () => {
      try {
        sub.close();
      } catch (err) {
        logger?.log("error", `failed to close subscription (id: ${sub.subId}): ${err}`);
      }
      removeRelayListeners();
      logger?.log("verbose", `CLOSE: subId=${options.subId ?? "<auto>"}`);
    };

    // start the subscription
    logger?.log("verbose", `REQ: subId=${options.subId ?? "<auto>"}, filter=%O`, filter);
    try {
      sub.req();
    } catch (err) {
      tx.error(new FetchTillEoseFailedSignal("failed to send REQ", { cause: err }));
      removeRelayListeners();
    }

    // handle abortion
    if (options.abortSignal?.aborted) {
      closeSub();
      tx.error(
        new FetchTillEoseAbortedSignal(`subscription (id: ${sub.subId}) aborted by AbortController`)
      );
    }
    options.abortSignal?.addEventListener("abort", () => {
      closeSub();
      tx.error(
        new FetchTillEoseAbortedSignal(`subscription (id: ${sub.subId}) aborted by AbortController`)
      );
    });

    yield* chIter;
  }
}
