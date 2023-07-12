import { Channel } from "@nostr-fetch/kernel/channel";
import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import {
  FetchTillEoseAbortedSignal,
  FetchTillEoseFailedSignal,
  type EnsureRelaysOptions,
  type FetchTillEoseOptions,
  type NostrFetcherBackend,
  type NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrl, normalizeRelayUrlSet, withTimeout } from "@nostr-fetch/kernel/utils";

import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent, NDKRelay, NDKRelaySet, NDKRelayStatus } from "@nostr-dev-kit/ndk";

export class NDKAdapter implements NostrFetcherBackend {
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
    { connectTimeoutMs }: EnsureRelaysOptions,
  ): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrlSet(relayUrls);

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
      { managedRurls: [] as string[], unconnRurls: [] as string[] },
    );
    this.#debugLogger?.log("verbose", "managed=%O, unconnected=%O", managedRurls, unconnRurls);

    const ensure = async (rurl: string) => {
      const logger = this.#debugLogger?.subLogger(rurl);

      const r = new NDKRelay(rurl);
      await r.connect();

      r.on("disconnect", () => {
        console.info(r.status);
        logger?.log("info", "disconnected");
      });
      r.on("notice", (_: unknown, notice: string) => logger?.log("warn", `NOTICE: ${notice}`));
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
            `attempt to connect to the relay ${rurl} timed out`,
          );

          connectedRurls.push(rurl);
          this.#implicitRelays.set(rurl, r);
        } catch (err) {
          this.#debugLogger?.log("error", err);
        }
      }),
    );
    return [...managedRurls, ...connectedRurls];
  }

  private getRelayIfConnected(relayUrl: string): NDKRelay | undefined {
    const normalized = normalizeRelayUrl(relayUrl);

    const r1 = this.#ndk.pool.relays.get(normalized);
    if (r1 !== undefined && r1.status === NDKRelayStatus.CONNECTED) {
      return r1;
    }
    const r2 = this.#implicitRelays.get(normalized);
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

    // start subscription
    const sub = this.#ndk.subscribe(
      filter,
      { closeOnEose: true },
      new NDKRelaySet(new Set([relay]), this.#ndk),
    );

    // common process to close subscription
    const closeSub = () => {
      sub.stop();
      removeRelayListeners();
    };

    // error handlings
    // TODO: how to handle WebSocket error?
    const onNotice = (_: unknown, notice: string) => {
      closeSub();
      tx.error(new FetchTillEoseFailedSignal(`NOTICE: ${notice}`));
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
    };
    relay.on("notice", onNotice);

    // handle subscription events
    sub.on("event", (ndkEv: NDKEvent) => {
      tx.send(ndkEv.rawEvent() as NostrEvent);
      resetAutoAbortTimer();
    });
    sub.on("eose", () => {
      closeSub();
      tx.close();
    });

    // auto abortion
    let subAutoAbortTimer: NodeJS.Timer | undefined;
    const resetAutoAbortTimer = () => {
      if (subAutoAbortTimer !== undefined) {
        clearTimeout(subAutoAbortTimer);
        subAutoAbortTimer = undefined;
      }
      subAutoAbortTimer = setTimeout(() => {
        closeSub();
        tx.error(new FetchTillEoseAbortedSignal("subscription aborted before EOSE due to timeout"));
      }, options.abortSubBeforeEoseTimeoutMs);
    };
    resetAutoAbortTimer(); // initiate subscription auto abortion timer

    // handle abortion by AbortController
    if (options.abortSignal?.aborted) {
      closeSub();
      tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
    }
    options.abortSignal?.addEventListener("abort", () => {
      closeSub();
      tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
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
