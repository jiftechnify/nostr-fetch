import { setupSubscriptionAbortion } from "@nostr-fetch/kernel/adapterHelpers";
import { Channel } from "@nostr-fetch/kernel/channel";
import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import {
  FetchTillEoseFailedSignal,
  type EnsureRelaysOptions,
  type FetchTillEoseOptions,
  type NostrFetcherBackend,
  type NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import { NostrEvent, isNoticeForReqError, type Filter } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrl, normalizeRelayUrlSet, withTimeout } from "@nostr-fetch/kernel/utils";

import type { SimplePool, Relay as ToolsRelay } from "nostr-tools";

export class SimplePoolExt implements NostrFetcherBackend {
  #simplePool: SimplePool;

  // storing refs to `ToolsRelay`s to allow to take out them synchronously.
  // keys are **normalized** relay URLs.
  #relays: Map<string, ToolsRelay> = new Map();

  #debugLogger: DebugLogger | undefined;

  constructor(sp: SimplePool, options: Required<NostrFetcherCommonOptions>) {
    this.#simplePool = sp;
    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }
  }

  /**
   * Ensures connections to the relays prior to an event subscription.
   *
   * Returns URLs of relays *successfully connected to*.
   *
   * It should *normalize* the passed `relayUrls` before establishing connections to relays.
   */
  public async ensureRelays(
    relayUrls: string[],
    { connectTimeoutMs }: EnsureRelaysOptions,
  ): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrlSet(relayUrls);

    const ensure = async (rurl: string) => {
      const logger = this.#debugLogger?.subLogger(rurl);

      const r = await this.#simplePool.ensureRelay(rurl);

      // setup debug log
      r.on("disconnect", () => logger?.log("info", `disconnected`));
      r.on("error", () => logger?.log("error", `WebSocket error`));
      r.on("notice", (notice) => logger?.log("warn", `NOTICE: ${notice}`));
      r.on("auth", () => logger?.log("warn", `received AUTH challenge (ignoring)`));

      return r;
    };

    const connectedRelays: string[] = [];
    await Promise.all(
      normalizedUrls.map(async (rurl) => {
        try {
          const r = await withTimeout(
            ensure(rurl),
            connectTimeoutMs,
            `attempt to connect to the relay ${rurl} timed out`,
          );

          connectedRelays.push(rurl);
          this.#relays.set(rurl, r);
        } catch (err) {
          this.#debugLogger?.log("error", err);
          this.#relays.delete(rurl);
        }
      }),
    );
    return connectedRelays;
  }

  private getRelayIfConnected(relayUrl: string): ToolsRelay | undefined {
    return this.#relays.get(normalizeRelayUrl(relayUrl));
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
  public fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions,
  ): AsyncIterable<NostrEvent> {
    const relay = this.getRelayIfConnected(relayUrl);
    if (relay === undefined) {
      throw new FetchTillEoseFailedSignal("failed to ensure connection to the relay");
    }

    const [tx, chIter] = Channel.make<NostrEvent>();

    // start a subscription
    const sub = relay.sub([filter], {
      skipVerification: options.skipVerification,
      ...(options.subId !== undefined ? { id: options.subId } : {}),
    });

    // common process to close subscription
    const closeSub = () => {
      sub.unsub();
      removeRelayListeners();
    };

    // error handlings
    const onNotice = (n: string) => {
      // ignore if the message seems to have nothing to do with REQs by fetcher
      if (!isNoticeForReqError(n)) {
        return;
      }

      closeSub();
      tx.error(new FetchTillEoseFailedSignal(`NOTICE: ${JSON.stringify(n)}`));
    };
    const onError = () => {
      removeRelayListeners();
      tx.error(new FetchTillEoseFailedSignal("WebSocket error"));
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
      relay.off("error", onError);
    };

    relay.on("notice", onNotice);
    relay.on("error", onError);

    // setup abortion
    const resetAutoAbortTimer = setupSubscriptionAbortion(closeSub, tx, options);

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
      resetAutoAbortTimer();
    });
    sub.on("eose", () => {
      closeSub();
      tx.close();
    });

    return chIter;
  }

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * It doesn't close any connections to relays, because other codes may reuse them.
   */
  public shutdown(): void {
    // just clear extra refs to `RelayExt`s
    this.#relays.clear();
  }
}
