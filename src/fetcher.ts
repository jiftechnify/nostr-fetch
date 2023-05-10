import { Channel } from "./channel";
import { Filter, NostrEvent, verifyEventSig } from "./nostr";
import { initRelayPool } from "./relayPool";
import type { RelayHandle, RelayPoolHandle, SubscriptionOptions } from "./relayTypes";

export type FetchFilter = Omit<Filter, "limit" | "since" | "until">;
export type FetchTimeRangeFilter = Pick<Filter, "since" | "until">;

export type FetcherInitOptions = {
  enableDebugLog?: boolean;
};

const defaultFetcherInitOptions: Required<FetcherInitOptions> = {
  enableDebugLog: false,
};

const MAX_LIMIT_PER_REQ = 5000;

export type FetchOptions = {
  skipVerification?: boolean;
  connectTimeoutMs?: number;
  abortSignal?: AbortSignal | undefined;
  abortSubBeforeEoseTimeoutMs?: number;
  limitPerReq?: number;
};

const defaultFetchOptions: Required<FetchOptions> = {
  skipVerification: false,
  connectTimeoutMs: 5000,
  abortSignal: undefined,
  abortSubBeforeEoseTimeoutMs: 10000,
  limitPerReq: MAX_LIMIT_PER_REQ,
};

export type FetchAllOptions = FetchOptions & {
  sort?: boolean;
};

const defaultFetchAllOptions: Required<FetchAllOptions> = {
  ...defaultFetchOptions,
  sort: false,
};

export type FetchLatestOptions = FetchOptions & {
  reduceVerification?: boolean;
};

const defaultFetchLatestOptions: Required<FetchLatestOptions> = {
  ...defaultFetchOptions,
  reduceVerification: true,
};

// eslint-disable-next-line require-yield
async function* emptyAsyncGen() {
  return;
}

export class NostrFetcher {
  #relayPool: RelayPoolHandle;
  #logForDebug: typeof console.log | undefined;

  private constructor(relayPool: RelayPoolHandle, initOpts: Required<FetcherInitOptions>) {
    this.#relayPool = relayPool;

    if (initOpts.enableDebugLog) {
      this.#logForDebug = console.log;
    }
  }

  /**
   * Initializes `NostrFetcher` with the default relay pool implementation.
   */
  public static init(initOpts: FetcherInitOptions = {}) {
    const finalOpts = { ...defaultFetcherInitOptions, ...initOpts };
    const rp = initRelayPool(finalOpts);
    return new NostrFetcher(rp, finalOpts);
  }

  /**
   * Initializes `NostrFetcher` with the given relay pool implementation.
   *
   * ```ts
   * const pool = new SimplePool();
   * const fetcher = NostrFetcher.withRelayPool(simplePoolAdapter(pool));
   * ```
   */
  public static withRelayPool(relayPool: RelayPoolHandle, initOpts: FetcherInitOptions = {}) {
    const finalOpts = { ...defaultFetcherInitOptions, ...initOpts };
    return new NostrFetcher(relayPool, finalOpts);
  }

  /**
   * Returns an async iterable of all events matching the filters from Nostr relays specified by the array of URLs.
   *
   * You can iterate over events using for-await-of loop.
   *
   * Note: there are no guarantees about the order of returned events.
   *
   * @param relayUrls
   * @param filters
   * @param timeRangeFilter
   * @param options
   * @returns
   */
  public async allEventsIterator(
    relayUrls: string[],
    filters: FetchFilter[],
    timeRangeFilter: FetchTimeRangeFilter,
    options: FetchOptions = {}
  ): Promise<AsyncIterable<NostrEvent>> {
    const finalOpts: Required<FetchOptions> = {
      ...defaultFetchOptions,
      ...options,
    };

    if (relayUrls.length === 0) {
      console.error("you must specify at least one relay URL");
      return emptyAsyncGen();
    }
    if (filters.length === 0) {
      console.error("you must specify at least one filter");
      return emptyAsyncGen();
    }

    const relays = await this.#relayPool.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = timeRangeFilter.until ?? Math.floor(Date.now() / 1000);

    Promise.all(
      relays.map(async (r) => {
        let nextUntil = initialUntil;
        const localSeenEventIds = new Set<string>();
        while (true) {
          const refinedFilters = filters.map((filter) => {
            return {
              ...timeRangeFilter,
              ...filter,
              until: nextUntil,
              // relays are supposed to return *latest* events by specifying `limit` explicitly (cf. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
              // nostream doesn't accept a filter which has `limit` grater than 5000, so limit `limit` to this threshold or less.
              limit: Math.min(finalOpts.limitPerReq, MAX_LIMIT_PER_REQ),
            };
          });

          let numNewEvents = 0;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          for await (const e of this.fetchEventsTillEose(
            r,
            refinedFilters,
            finalOpts,
            finalOpts.abortSignal
          )) {
            // eliminate duplicated events
            if (!localSeenEventIds.has(e.id)) {
              numNewEvents++;
              localSeenEventIds.add(e.id);
              if (e.created_at < oldestCreatedAt) {
                oldestCreatedAt = e.created_at;
              }

              if (!globalSeenEventIds.has(e.id)) {
                globalSeenEventIds.add(e.id);
                tx.send(e);
              }
            }
          }

          if (finalOpts.abortSignal?.aborted) {
            this.#logForDebug?.(`[${r.url}] aborted`);
            break;
          }
          if (numNewEvents === 0) {
            this.#logForDebug?.(`[${r.url}] got ${localSeenEventIds.size} events`);
            break;
          }
          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
        }
      })
    ).then(() => {
      tx.close();
    });
    return chIter;
  }

  /**
   * Fetches all events matching the filters from Nostr relays specified by the array of URLs,
   * and collect them into an array.
   *
   * Note: there are no guarantees about the order of returned events if `sort` options is not specified.
   *
   * @param relayUrls
   * @param filters
   * @param timeRangeFilter
   * @param options
   * @returns
   */
  public async fetchAllEvents(
    relayUrls: string[],
    filters: FetchFilter[],
    timeRangeFilter: FetchTimeRangeFilter,
    options: FetchAllOptions = {}
  ): Promise<NostrEvent[]> {
    const finalOpts = { ...defaultFetchAllOptions, ...options };

    const res: NostrEvent[] = [];

    const allEvents = await this.allEventsIterator(relayUrls, filters, timeRangeFilter, finalOpts);
    for await (const ev of allEvents) {
      res.push(ev);
    }

    // sort events in "newest to oldest" order if `sort` options is specified
    if (finalOpts.sort) {
      res.sort((a, b) => b.created_at - a.created_at);
    }
    return res;
  }

  /**
   * Fetches latest events matching the filters from Nostr relays specified by the array of URLs.
   *
   * Events are sorted in "newest to oldest" order.
   *
   * @param relayUrls
   * @param filters
   * @param limit
   * @param options
   * @returns
   */
  public async fetchLatestEvents(
    relayUrls: string[],
    filters: FetchFilter[],
    limit: number,
    options: FetchLatestOptions = {}
  ): Promise<NostrEvent[]> {
    const finalOpts: Required<FetchLatestOptions> = {
      ...defaultFetchLatestOptions,
      ...options,
    };

    if (relayUrls.length === 0) {
      console.error("you must specify at least one relay URL");
      return [];
    }
    if (filters.length === 0) {
      console.error("you must specify at least one filter");
      return [];
    }

    const relays = await this.#relayPool.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = Math.floor(Date.now() / 1000);
    const subOpts: SubscriptionOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };

    // fetch at most `limit` events from each relay
    Promise.all(
      relays.map(async (r) => {
        let nextUntil = initialUntil;
        let remainingLimit = limit;

        const localSeenEventIds = new Set<string>();

        while (true) {
          const refinedFilters = filters.map((filter) => {
            return {
              ...filter,
              until: nextUntil,
              // relays are supposed to return *latest* events by specifying `limit` explicitly (cf. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
              // nostream doesn't accept a filter which has `limit` grater than 5000, so limit `limit` to this threshold or less.
              limit: Math.min(remainingLimit, MAX_LIMIT_PER_REQ),
            };
          });

          let numNewEvents = 0;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          for await (const e of this.fetchEventsTillEose(
            r,
            refinedFilters,
            subOpts,
            finalOpts.abortSignal
          )) {
            // eliminate duplicated events
            if (!localSeenEventIds.has(e.id)) {
              numNewEvents++;
              localSeenEventIds.add(e.id);
              if (e.created_at < oldestCreatedAt) {
                oldestCreatedAt = e.created_at;
              }

              if (!globalSeenEventIds.has(e.id)) {
                globalSeenEventIds.add(e.id);
                tx.send(e);
              }
            }
          }

          if (finalOpts.abortSignal?.aborted) {
            this.#logForDebug?.(`[${r.url}] aborted`);
            break;
          }

          remainingLimit -= numNewEvents;
          if (numNewEvents === 0 || remainingLimit <= 0) {
            this.#logForDebug?.(`[${r.url}] got ${localSeenEventIds.size} events`);
            break;
          }

          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
        }
      })
    ).then(() => {
      tx.close();
    });

    // collect events from relays
    const evs: NostrEvent[] = [];
    for await (const ev of chIter) {
      evs.push(ev);
    }
    evs.sort((a, b) => b.created_at - a.created_at);

    // return latest `limit` events if not "reduced verification mode"
    if (finalOpts.skipVerification || !finalOpts.reduceVerification) {
      return evs.slice(0, limit);
    }

    // reduced verification: return latest `limit` events whose signature is valid
    const res: NostrEvent[] = [];
    for (const ev of evs) {
      if (verifyEventSig(ev)) {
        res.push(ev);
        if (res.length >= limit) {
          break;
        }
      }
    }
    return res;
  }

  /**
   * Fetches the last event matching the filters from Nostr relays specified by the array of URLs.
   *
   * Returns `undefined` if no event matching the filters exists in any relay.
   *
   * @param relayUrls
   * @param filters
   * @param options
   * @returns
   */
  public async fetchLastEvent(
    relayUrls: string[],
    filters: FetchFilter[],
    options: FetchLatestOptions = {}
  ): Promise<NostrEvent | undefined> {
    const finalOpts: FetchLatestOptions & { abortSubBeforeEoseTimeoutMs: number } = {
      ...defaultFetchLatestOptions,
      // override default value of `abortSubBeforeEoseTimeoutMs` (10000 -> 1000)
      abortSubBeforeEoseTimeoutMs: options.abortSubBeforeEoseTimeoutMs ?? 1000,
    };
    const latest1 = await this.fetchLatestEvents(relayUrls, filters, 1, finalOpts);
    return latest1[0];
  }

  private fetchEventsTillEose(
    relay: RelayHandle,
    filters: Filter[],
    subOpts: SubscriptionOptions,
    signal: AbortSignal | undefined
  ): AsyncIterable<NostrEvent> {
    const [tx, chIter] = Channel.make<NostrEvent>();

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

    // prepare a subscription
    const sub = relay.prepareSub(filters, subOpts);

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
    });
    sub.on("eose", ({ aborted }) => {
      if (aborted) {
        this.#logForDebug?.(`subscription (id: ${sub.subId}) aborted before EOSE due to timeout`);
      }

      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // handle abortion
    signal?.addEventListener("abort", () => {
      this.#logForDebug?.(`subscription (id: ${sub.subId}) aborted via AbortController`);

      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // start the subscription
    sub.req();

    return chIter;
  }

  public shutdown() {
    this.#relayPool.closeAll();
  }
}
