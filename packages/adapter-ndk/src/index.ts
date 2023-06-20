import { Channel } from "@nostr-fetch/kernel/channel";
import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import type {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBase,
  NostrFetcherBaseInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBase";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { emptyAsyncGen, normalizeRelayUrls, withTimeout } from "@nostr-fetch/kernel/utils";

import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent, NDKRelay, NDKRelaySet, NDKRelayStatus } from "@nostr-dev-kit/ndk";

class NDKAdapter implements NostrFetcherBase {
  #ndk: NDK;
  #implicitRelays: Map<string, NDKRelay> = new Map();

  #debugLogger: DebugLogger | undefined;

  constructor(ndk: NDK, options: Required<NostrFetcherCommonOptions>) {
    this.#ndk = ndk;
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

    // partition relays to 2 groups:
    // 1. managed by the NDK pool or the adapter
    // 2. unconnected
    const { managedRurls, unconnRurls } = normalizedUrls.reduce(
      ({ managedRurls, unconnRurls }, rurl) => {
        if (this.#ndk.pool.relays.has(rurl) || this.#implicitRelays.has(rurl)) {
          return { managedRurls: [...managedRurls, rurl], unconnRurls: unconnRurls };
        }
        return { managedRurls: managedRurls, unconnRurls: [...unconnRurls, rurl] };
      },
      { managedRurls: [] as string[], unconnRurls: [] as string[] }
    );
    this.#debugLogger?.log("verbose", "managed=%O, unconnected=%O", managedRurls, unconnRurls);

    const ensure = async (rurl: string) => {
      const logger = this.#debugLogger?.subLogger(rurl);

      const r = new NDKRelay(rurl);
      await r.connect();

      r.on("disconnect", () => logger?.log("info", "disconnected"));
      r.on("notice", (notice: string) => logger?.log("warn", `NOTICE: ${notice}`));
      return r;
    };

    // attempt to connect to all unconnected relays
    const connectedRurls: string[] = [];
    await Promise.all(
      unconnRurls.map(async (rurl) => {
        try {
          const r = await withTimeout(
            ensure(rurl),
            connectTimeoutMs,
            `attempt to connect to the relay ${rurl} timed out`
          );

          connectedRurls.push(rurl);
          this.#implicitRelays.set(rurl, r);
        } catch (err) {
          this.#debugLogger?.log("error", err);
        }
      })
    );
    return [...managedRurls, ...connectedRurls];
  }

  private getRelayIfConnected(relayUrl: string): NDKRelay | undefined {
    const r1 = this.#ndk.pool.relays.get(relayUrl);
    if (r1 !== undefined && r1.status === NDKRelayStatus.CONNECTED) {
      return r1;
    }
    const r2 = this.#implicitRelays.get(relayUrl);
    if (r2 !== undefined && r2.status === NDKRelayStatus.CONNECTED) {
      return r2;
    }
    return undefined;
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
    const onNotice = (msg: string) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(msg)}`));
      removeRelayListeners();
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
    };
    relay.on("notice", onNotice);

    const sub = this.#ndk.subscribe(
      filter,
      { closeOnEose: true },
      new NDKRelaySet(new Set([relay]), this.#ndk)
    );

    // handle subscription events
    sub.on("event", (ndkEv: NDKEvent) => {
      tx.send(ndkEv.rawEvent() as NostrEvent);
      resetAutoAbortTimer();
    });
    sub.on("eose", () => {
      closeSub();
    });

    // common process to close subscription
    const closeSub = () => {
      sub.stop();
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

    // start subscription
    sub.start();

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
   * Disconnects from relays managed by the adapter.
   */
  public shutdown(): void {
    for (const relay of this.#implicitRelays.values()) {
      relay.disconnect();
    }
    this.#implicitRelays.clear();
  }
}

/**
 * Wraps an NDK instance, allowing it to interoperate with nostr-fetch.
 *
 * Note: if you use this adapter, `skipVerification` option is ignored and it always behaves as if `false` is specified (always verify signatures).
 * Moreover, `reduceVerification` option becomes meaningless with this adapter.
 *
 * @example
 * ```
 * import NDK from '@nostr-dev-kit/ndk';
 * import { NostrFetcher, normalizeRelayUrls } from 'nostr-fetch';
 * import { ndkAdapter } from '@nostr-fetch/adapter-ndk';
 *
 * // You should normalize relay URLs by `normalizeRelayUrls` before passing them to NDK's constructor if working with nostr-fetch!
 * const explicitRelays = normalizeRelayUrls([
 *   "wss://relay-jp.nostr.wirednet.jp",
 *   "wss://relay.damus.io",
 * ]);
 *
 * const main = async () => {
 *   const ndk = new NDK({ explicitRelayUrls: explicitRelays });
 *   await ndk.connect(); // ensure connections to the "explicit relays" before fetching events!
 *
 *   const fetcher = NostrFetcher.withCustomPool(ndkAdapter(ndk));
 *   // ...
 * }
 * ```
 */
export const ndkAdapter = (ndk: NDK): NostrFetcherBaseInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new NDKAdapter(ndk, commonOpts);
  };
};
