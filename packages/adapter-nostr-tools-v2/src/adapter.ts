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
import { type NostrEvent, isNoticeForReqError, type Filter } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrl, normalizeRelayUrlSet, withTimeout } from "@nostr-fetch/kernel/utils";

import type { AbstractSimplePool } from "nostr-tools/abstract-pool";
import type { AbstractRelay as ToolsRelay } from "nostr-tools/abstract-relay";

type CloseCb = () => void;
type NoticeCb = (msg: string) => void;

type SimplePoolEventCbs = {
  close: CloseCb;
  notice: NoticeCb;
};
type SimplePoolEventTypes = keyof SimplePoolEventCbs;

type SimplePoolListenersTable = {
  [E in keyof SimplePoolEventCbs]: Map<string, SimplePoolEventCbs[E]>;
};

export class SimplePoolAdapter implements NostrFetcherBackend {
  #pool: AbstractSimplePool;

  // storing refs to `ToolsRelay`s to allow to take out them synchronously.
  // keys are **normalized** relay URLs.
  #relays: Map<string, ToolsRelay> = new Map();

  // we need to manage "per-relay" notice/close listeners since we can't add multiple listeners to relay for each event type.
  #listeners: SimplePoolListenersTable = {
    notice: new Map(),
    close: new Map(),
  };

  #debugLogger: DebugLogger | undefined;

  constructor(sp: AbstractSimplePool, options: Required<NostrFetcherCommonOptions>) {
    this.#pool = sp;
    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }
  }

  // add "per-relay" event listeners
  #addListener<E extends SimplePoolEventTypes>(
    relayUrl: string,
    type: E,
    cb: SimplePoolEventCbs[E],
  ) {
    this.#listeners[type].set(normalizeRelayUrl(relayUrl), cb);
  }

  // remove "per-relay" event listeners
  #removeListener<E extends SimplePoolEventTypes>(relayUrl: string, type: E) {
    this.#listeners[type].delete(normalizeRelayUrl(relayUrl));
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

      const r = await this.#pool.ensureRelay(rurl);

      // dispatch events to "per-relay" listeners.
      r.onclose = () => {
        logger?.log("info", "closed");
        this.#listeners.close.get(rurl)?.();
      };
      r.onnotice = (notice) => {
        logger?.log("warn", `NOTICE: ${notice}`);
        this.#listeners.notice.get(rurl)?.(notice);
      };

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

  #getRelayIfConnected(relayUrl: string): ToolsRelay | undefined {
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
    const relay = this.#getRelayIfConnected(relayUrl);
    if (relay === undefined) {
      throw new FetchTillEoseFailedSignal("failed to ensure connection to the relay");
    }

    const [tx, chIter] = Channel.make<NostrEvent>();

    // prepare a subscription
    const sub = relay.prepareSubscription([filter], {
      onevent: (ev: NostrEvent) => {
        tx.send(ev);
        resetAutoAbortTimer();
      },
      oneose: () => {
        closeSub();
        tx.close();
      },
      ...(options.subId !== undefined ? { id: options.subId } : {}),
    });

    // common process to close subscription
    const closeSub = () => {
      removeRelayListeners();
      sub.close();
    };

    // setup abortion
    const resetAutoAbortTimer = setupSubscriptionAbortion(closeSub, tx, options);

    // error handlings
    const removeRelayListeners = () => {
      this.#removeListener(relayUrl, "notice");
      this.#removeListener(relayUrl, "close");
    };

    const onNotice = (n: string) => {
      // ignore if the message seems to have nothing to do with REQs by fetcher
      if (!isNoticeForReqError(n)) {
        return;
      }

      closeSub();
      tx.error(new FetchTillEoseFailedSignal(`NOTICE: ${JSON.stringify(n)}`));
    };
    const onClose = () => {
      removeRelayListeners();
      tx.error(new FetchTillEoseFailedSignal("WebSocket error"));
    };

    this.#addListener(relayUrl, "notice", onNotice);
    this.#addListener(relayUrl, "close", onClose);

    // start the subscription
    sub.fire();

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
