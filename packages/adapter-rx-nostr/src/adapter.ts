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
import {
  FilterMatcher,
  isNoticeForReqError,
  type Filter,
  type NostrEvent,
} from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrl, normalizeRelayUrlSet } from "@nostr-fetch/kernel/utils";

import { RxNostr, createRxOneshotReq, filterType, verify } from "rx-nostr";
import { filter } from "rxjs";

export class RxNostrAdapter implements NostrFetcherBackend {
  #rxNostr: RxNostr;
  #debugLogger: DebugLogger | undefined;

  constructor(rxNostr: RxNostr, options: Required<NostrFetcherCommonOptions>) {
    this.#rxNostr = rxNostr;
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

    // update relay config in order to enable reading from specified relays
    const relayConfs = new Map(
      this.#rxNostr
        .getRelays()
        .map((r) => [normalizeRelayUrl(r.url), { read: r.read, write: r.write }]),
    );
    this.#debugLogger?.log("verbose", "relay configs: %O", relayConfs);

    for (const rurl of normalizedUrls) {
      const relayConf = relayConfs.get(rurl);
      if (relayConf === undefined) {
        await this.#rxNostr.addRelay({ url: rurl, read: true, write: false });
      } else if (!relayConf.read) {
        await this.#rxNostr.addRelay({ url: rurl, read: true, write: relayConf.write });
      }
    }

    const ac = new AbortController();
    setTimeout(() => {
      ac.abort();
    }, connectTimeoutMs);

    const ensuredRelayUrls = new Promise<string[]>((resolve) => {
      const relayUrlsToConnect = new Set(normalizedUrls);
      const relayUrlsConnected = new Set<string>();

      const allRelayState = this.#rxNostr.getAllRelayState();
      for (const rurl of normalizedUrls) {
        const state = allRelayState[rurl];
        if (state === "ongoing") {
          relayUrlsConnected.add(rurl);
        }
      }
      if (relayUrlsToConnect.size === relayUrlsConnected.size) {
        resolve([...relayUrlsConnected]);
        return;
      }

      // wait until all relays become "ongoing" state
      const onTimeout = () => {
        this.#debugLogger?.log("error", "timed out ensuring connections to the relays");
        connStateSub.unsubscribe();
        resolve([...relayUrlsConnected]);
      };
      const connStateSub = this.#rxNostr
        .createConnectionStateObservable()
        .pipe(filter(({ from: rurl }) => relayUrlsToConnect.has(normalizeRelayUrl(rurl))))
        .subscribe({
          next: ({ from: rurl, state }) => {
            this.#debugLogger?.log("info", `[${rurl}] connection state changed to ${state}`);

            if (state === "ongoing") {
              relayUrlsConnected.add(rurl);
              if (relayUrlsToConnect.size === relayUrlsConnected.size) {
                connStateSub.unsubscribe();
                ac.signal.removeEventListener("abort", onTimeout);
                resolve([...relayUrlsConnected]);
              }
            } else {
              relayUrlsConnected.delete(rurl);
            }
          },
        });

      // return relays connected so far on timeout
      ac.signal.addEventListener("abort", onTimeout);
    });
    return ensuredRelayUrls;
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
    nostrFilter: Filter,
    options: FetchTillEoseOptions,
  ): AsyncIterable<NostrEvent> {
    const [tx, chIter] = Channel.make<NostrEvent>();

    const nfilterMatcher = new FilterMatcher([nostrFilter]);
    const req = createRxOneshotReq(
      options.subId ? { filters: [nostrFilter], subId: options.subId } : { filters: [nostrFilter] },
    );
    const closeSub = () => {
      sub.unsubscribe();
      noticeSub.unsubscribe();
      errSub.unsubscribe();
    };
    const resetAutoAbortTimer = setupSubscriptionAbortion(closeSub, tx, options);

    let observable = this.#rxNostr.use(req, { scope: [relayUrl] });
    if (!options.skipVerification) {
      observable = observable.pipe(verify());
    }
    if (!options.skipFilterMatching) {
      observable = observable.pipe(filter(({ event }) => nfilterMatcher.match(event)));
    }

    const sub = observable.subscribe({
      next: ({ event }) => {
        resetAutoAbortTimer();
        tx.send(event);
      },
      complete: () => {
        closeSub();
        tx.close();
      },
    });

    const noticeSub = this.#rxNostr
      .createAllMessageObservable()
      .pipe(
        filterType("NOTICE"),
        filter(
          ({ from, message: [, notice] }) =>
            normalizeRelayUrl(from) === relayUrl && isNoticeForReqError(notice),
        ),
      )
      .subscribe(({ message: [, notice] }) => {
        closeSub();
        tx.error(new FetchTillEoseFailedSignal(notice));
      });

    const errSub = this.#rxNostr
      .createAllErrorObservable()
      .pipe(filter(({ from }) => normalizeRelayUrl(from) === relayUrl))
      .subscribe(({ reason }) => {
        closeSub();
        tx.error(new FetchTillEoseFailedSignal(String(reason)));
      });

    return chIter;
  }

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * Actually it does nothing.
   */
  public shutdown(): void {
    // do nothing
  }
}
