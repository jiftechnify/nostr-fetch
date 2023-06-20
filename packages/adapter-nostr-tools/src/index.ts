import { Channel } from "@nostr-fetch/kernel/channel";
import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import type {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBase,
  NostrFetcherBaseInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBase";
import { NostrEvent, type Filter } from "@nostr-fetch/kernel/nostr";
import {
  emptyAsyncGen,
  normalizeRelayUrl,
  normalizeRelayUrls,
  withTimeout,
} from "@nostr-fetch/kernel/utils";

import type { SimplePool, Relay as ToolsRelay } from "nostr-tools";

class SimplePoolExt implements NostrFetcherBase {
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
    { connectTimeoutMs }: EnsureRelaysOptions
  ): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);

    const ensure = async (rurl: string) => {
      const logger = this.#debugLogger?.subLogger(rurl);

      const r = await this.#simplePool.ensureRelay(rurl);

      // setup debug log
      r.on("disconnect", () => logger?.log("info", `disconnected`));
      r.on("error", () => logger?.log("error", `WebSocket error`));
      r.on("notice", (notice) => logger?.log("warn", `NOTICE: ${notice}`));
      r.on("auth", () => logger?.log("warn", `received AUTH challange (ignoring)`));

      return r;
    };

    const connectedRelays: string[] = [];
    await Promise.all(
      normalizedUrls.map(async (rurl) => {
        try {
          const r = await withTimeout(
            ensure(rurl),
            connectTimeoutMs,
            `attempt to connect to the relay ${rurl} timed out`
          );

          connectedRelays.push(rurl);
          this.#relays.set(rurl, r);
        } catch (err) {
          this.#debugLogger?.log("error", err);
          this.#relays.delete(rurl);
        }
      })
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
   * If no connection to the specified relay has been established at the time this function is called, it will return an empty channel.
   */
  public fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const logger = this.#debugLogger?.subLogger(relayUrl);

    const relay = this.getRelayIfConnected(relayUrl);
    if (relay === undefined) {
      logger?.log("warn", "not connected");
      return emptyAsyncGen();
    }

    const [tx, chIter] = Channel.make<NostrEvent>();

    // error handlings
    const onNotice = (n: unknown) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));
      removeRelayListeners();
    };
    const onError = () => {
      tx.error(Error("ERROR"));
      removeRelayListeners();
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
      relay.off("error", onError);
    };

    relay.on("notice", onNotice);
    relay.on("error", onError);

    // start a subscription
    const sub = relay.sub([filter], {
      skipVerification: options.skipVerification,
      ...(options.subId !== undefined ? { id: options.subId } : {}),
    });

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
      resetAutoAbortTimer();
    });
    sub.on("eose", () => {
      closeSub();
    });

    // common process to close subscription
    const closeSub = () => {
      sub.unsub();
      tx.close();
      removeRelayListeners();
    };

    // auto abortion
    let subAutoAbortTimer: NodeJS.Timer | undefined;
    const resetAutoAbortTimer = () => {
      if (subAutoAbortTimer !== undefined) {
        clearTimeout(subAutoAbortTimer);
        subAutoAbortTimer = undefined;
      }
      subAutoAbortTimer = setTimeout(() => {
        logger?.log("info", "subscription aborted before EOSE due to timeout");
        closeSub();
      }, options.abortSubBeforeEoseTimeoutMs);
    };
    resetAutoAbortTimer(); // initiate subscription auto abortion timer

    // handle abortion by AbortController
    if (options.abortSignal?.aborted) {
      logger?.log("info", `subscription aborted by AbortController`);
      closeSub();
    }
    options.abortSignal?.addEventListener("abort", () => {
      logger?.log("info", `subscription aborted by AbortController`);
      closeSub();
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

/**
 * Wraps a nostr-tools' `SimplePool`, allowing it to interoperate with nostr-fetch.
 *
 * @example
 * ```
 * import { SimplePool } from 'nostr-tools';
 * import { NostrFetcher } from 'nostr-fetch';
 * import { simplePoolAdapter } from '@nostr-fetch/adapter-nostr-tools'
 *
 * const pool = new SimplePool();
 * const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
 * ```
 */
export const simplePoolAdapter = (pool: SimplePool): NostrFetcherBaseInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new SimplePoolExt(pool, commonOpts);
  };
};
