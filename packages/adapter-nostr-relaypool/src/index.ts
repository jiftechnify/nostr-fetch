import { Channel } from "@nostr-fetch/kernel/channel";
import type {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBase,
} from "@nostr-fetch/kernel/fetcherBase";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrls } from "@nostr-fetch/kernel/utils";

import type { RelayPool } from "nostr-relaypool";
import { withTimeout } from "./utils";

type NRTPoolNoticeCb = (msg: string) => void;
type NRTPoolErrorCb = (err: string) => void;
type NRTPoolDisconnectCb = (msg: string) => void;
type NRTPoolAuthCb = () => void; // actually "challange" will be passed here but ignoring

type NRTPoolEventCbs = {
  notice: NRTPoolNoticeCb;
  error: NRTPoolErrorCb;
  disconnect: NRTPoolDisconnectCb;
  auth: NRTPoolAuthCb;
};
type NRTPoolEventTypes = keyof NRTPoolEventCbs;

type NRTPoolListenersTable = {
  [E in keyof NRTPoolEventCbs]: Map<string, NRTPoolEventCbs[E]>;
};

type NRTPoolAdapterOptions = {
  enableDebugLog?: boolean;
};

const defaultOptions: Required<NRTPoolAdapterOptions> = {
  enableDebugLog: false,
};

class NRTPoolAdapter implements NostrFetcherBase {
  #pool: RelayPool;

  // we need to hold notice/error listeners here since we can't remove them from RelayPool.
  // relay URL -> listener
  #listeners: NRTPoolListenersTable = {
    notice: new Map(),
    error: new Map(),
    disconnect: new Map(),
    auth: new Map(),
  };

  #logForDebug: typeof console.log | undefined;

  constructor(pool: RelayPool, options: Required<NRTPoolAdapterOptions>) {
    // set listeners that dispatches events to "per-relay" listeners
    pool.onnotice((rurl, msg) => {
      this.#listeners.notice.get(rurl)?.(msg);
    });
    pool.onerror((rurl, msg) => {
      this.#listeners.error.get(rurl)?.(msg);
    });
    pool.ondisconnect((rurl, msg) => {
      this.#listeners.disconnect.get(rurl)?.(msg);
    });
    pool.onauth((relay, _) => {
      this.#listeners.auth.get(relay.url)?.();
    });

    this.#pool = pool;

    if (options.enableDebugLog) {
      this.#logForDebug = console.log;
    }
  }

  // add "per-relay" event listeners
  private addListener<E extends NRTPoolEventTypes>(
    relayUrl: string,
    type: E,
    cb: NRTPoolEventCbs[E]
  ) {
    this.#listeners[type].set(relayUrl, cb);
  }

  // remove "per-relay" event listeners
  private removeListener<E extends NRTPoolEventTypes>(relayUrl: string, type: E) {
    this.#listeners[type].delete(relayUrl);
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

    const ensure = (rurl: string) =>
      new Promise<string>((resolve, reject) => {
        const r = this.#pool.addOrGetRelay(rurl);

        r.on("connect", () => {
          // setup debug log
          // listener for notice/error will be overwritten in fetchTillEose
          this.addListener(rurl, "disconnect", (msg) =>
            this.#logForDebug?.(`[${rurl}] disconnected: ${msg}`)
          );
          this.addListener(rurl, "error", (msg) => {
            this.#logForDebug?.(`[${rurl}] Websocket error: ${msg}`);
          });
          this.addListener(rurl, "notice", (msg) => {
            this.#logForDebug?.(`[${rurl}] NOTICE: ${msg}`);
          });
          this.addListener(rurl, "auth", () =>
            this.#logForDebug?.(`[${rurl}] received AUTH challange (ignoring)`)
          );
          resolve(rurl);
        });

        r.on("error", () => {
          reject(Error(`failed to connect to relay '${rurl}'`));
        });
      });

    const ensureResults = await Promise.allSettled(
      normalizedUrls.map(async (rurl) => {
        return withTimeout(
          ensure(rurl),
          connectTimeoutMs,
          `attempt to connect to the relay ${rurl} timed out`
        );
      })
    );

    const connectedRelays = [];
    for (const r of ensureResults) {
      switch (r.status) {
        case "fulfilled":
          connectedRelays.push(r.value);
          break;
        case "rejected":
          console.error(r.reason);
          break;
      }
    }
    return connectedRelays;
  }

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * It doesn't close any connections to relays, because other codes may reuse them.
   */
  public shutdown(): void {
    // just clear listeners map
    for (const m of Object.values(this.#listeners)) {
      m.clear();
    }
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
    filters: Filter[],
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const [tx, chIter] = Channel.make<NostrEvent>();

    // error handlings
    const onNotice = (msg: string) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(msg)}`));
    };
    const onError = (msg: string) => {
      tx.error(Error(`ERROR: ${msg}`));
    };
    const removeRelayListeners = () => {
      this.removeListener(relayUrl, "notice");
      this.removeListener(relayUrl, "error");
    };
    this.addListener(relayUrl, "notice", onNotice);
    this.addListener(relayUrl, "error", onError);

    // if "relay" is set, that filter will be requested only from that relay
    // it's the very behavior we want here!
    const relayedFilters = filters.map((f) => {
      return { ...f, relay: relayUrl };
    });

    // subscribe
    const unsub = this.#pool.subscribe(
      relayedFilters,
      // relays
      [],
      // onEvent
      (ev) => {
        tx.send(ev);
        resetAutoAbortTimer();
      },
      // maxDeleyms
      undefined,
      // onEose
      () => {
        tx.close();
        removeRelayListeners();
      },
      {
        unsubscribeOnEose: true,
      }
    );

    // common process for subscription abortion
    const abortSub = (debugMsg: string) => {
      this.#logForDebug?.(debugMsg);
      unsub();
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
        abortSub(`[${relayUrl}] subscription aborted before EOSE due to timeout`);
      }, options.abortSubBeforeEoseTimeoutMs);
    };
    resetAutoAbortTimer(); // initiate subscription auto abortion timer

    // handle abortion by AbortController
    if (options.abortSignal?.aborted) {
      abortSub(`[${relayUrl}] subscription aborted by AbortController`);
    }
    options.abortSignal?.addEventListener("abort", () => {
      abortSub(`[${relayUrl}] subscription aborted by AbortController`);
    });

    return chIter;
  }
}

/**
 * Wraps a nostr-relaypool's `RelayPool`, allowing it to interoperate with nostr-fetch.
 *
 * @example
 * ```
 * import { RelayPool } from 'nostr-relaypool';
 * import { NostrFetcher } from 'nostr-fetch';
 * import { relayPoolAdapter } from '@nostr-fetch/adapter-nostr-relaypool'
 *
 * const pool = new RelayPool();
 * const fetcher = NostrFetcher.withCustomPool(relayPoolAdapter(pool));
 * ```
 */
export const relayPoolAdapter = (
  pool: RelayPool,
  options: NRTPoolAdapterOptions = {}
): NostrFetcherBase => {
  const finalOpts = { ...defaultOptions, ...options };
  return new NRTPoolAdapter(pool, finalOpts);
};
