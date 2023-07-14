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
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrlSet, withTimeout } from "@nostr-fetch/kernel/utils";

import type { RelayPool } from "nostr-relaypool";

type NRTPoolNoticeCb = (msg: string) => void;
type NRTPoolErrorCb = (err: string) => void;
type NRTPoolDisconnectCb = (msg: string) => void;
type NRTPoolAuthCb = () => void; // actually "challenge" will be passed here but ignoring

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

export class NRTPoolAdapter implements NostrFetcherBackend {
  #pool: RelayPool;

  // we need to hold notice/error listeners here since we can't remove them from RelayPool.
  // relay URL -> listener
  #listeners: NRTPoolListenersTable = {
    notice: new Map(),
    error: new Map(),
    disconnect: new Map(),
    auth: new Map(),
  };

  #debugLogger: DebugLogger | undefined;

  constructor(pool: RelayPool, options: Required<NostrFetcherCommonOptions>) {
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

    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }
  }

  // add "per-relay" event listeners
  private addListener<E extends NRTPoolEventTypes>(
    relayUrl: string,
    type: E,
    cb: NRTPoolEventCbs[E],
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
    { connectTimeoutMs }: EnsureRelaysOptions,
  ): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrlSet(relayUrls);

    const ensure = (rurl: string) =>
      new Promise<string>((resolve, reject) => {
        const logger = this.#debugLogger?.subLogger(rurl);

        const r = this.#pool.addOrGetRelay(rurl);

        r.on("connect", () => {
          // setup debug log
          // listener for notice/error will be overwritten in fetchTillEose
          this.addListener(
            rurl,
            "disconnect",
            (msg) => logger?.log("info", `disconnected: ${msg}`),
          );
          this.addListener(rurl, "error", (msg) => {
            logger?.log("error", `Websocket error: ${msg}`);
          });
          this.addListener(rurl, "notice", (msg) => {
            logger?.log("warn", `NOTICE: ${msg}`);
          });
          this.addListener(
            rurl,
            "auth",
            () => logger?.log("warn", "received AUTH challenge (ignoring)"),
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
          `attempt to connect to the relay ${rurl} timed out`,
        );
      }),
    );

    const connectedRelays = [];
    for (const r of ensureResults) {
      switch (r.status) {
        case "fulfilled":
          connectedRelays.push(r.value);
          break;
        case "rejected":
          this.#debugLogger?.log("error", r.reason);
          break;
      }
    }
    return connectedRelays;
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
    const [tx, chIter] = Channel.make<NostrEvent>();

    // if "relay" is set, that filter will be requested only from that relay
    // it's the very behavior we want here!
    const filterWithRelay = { ...filter, relay: relayUrl };

    // common process for subscription abortion
    const closeSub = () => {
      unsub();
      removeRelayListeners();
    };

    // error handlings
    const onNotice = (msg: string) => {
      closeSub();
      tx.error(new FetchTillEoseFailedSignal(`NOTICE: ${JSON.stringify(msg)}`));
    };
    const onError = (msg: string) => {
      removeRelayListeners();
      tx.error(new FetchTillEoseFailedSignal(`ERROR: ${msg}`));
    };
    const removeRelayListeners = () => {
      this.removeListener(relayUrl, "notice");
      this.removeListener(relayUrl, "error");
    };

    this.addListener(relayUrl, "notice", onNotice);
    this.addListener(relayUrl, "error", onError);

    // setup abortion
    const resetAutoAbortTimer = setupSubscriptionAbortion(closeSub, tx, options);

    // start subscription
    const unsub = this.#pool.subscribe(
      [filterWithRelay],
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
      },
    );

    return chIter;
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
}
