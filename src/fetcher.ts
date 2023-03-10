import { Channel } from "./channel";
import type { Filter, NostrEvent } from "./nostr";
import type { Relay } from "./relay";
import { initRelayPool, RelayPool } from "./relayPool";
import type { SubscriptionOptions } from "./relayTypes";

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
  checkEoseSupportTimeoutMs?: number;
  connectTimeoutMs?: number;
  autoEoseTimeoutMs?: number;
  limitPerReq?: number;
};

const defaultFetchOptions: Required<FetchOptions> = {
  skipVerification: false,
  checkEoseSupportTimeoutMs: 3000,
  connectTimeoutMs: 5000,
  autoEoseTimeoutMs: 10000,
  limitPerReq: MAX_LIMIT_PER_REQ,
};

export type FetchAllOptions = FetchOptions & {
  sort?: boolean;
};

const defaultFetchAllOptions: Required<FetchAllOptions> = {
  ...defaultFetchOptions,
  sort: false,
};

// eslint-disable-next-line require-yield
async function* emptyAsyncGen() {
  return;
}

export class NostrFetcher {
  #relayPool: RelayPool;
  #logForDebug: typeof console.log | undefined;

  constructor(initOpts: FetcherInitOptions = {}) {
    const opts = { ...defaultFetcherInitOptions, ...initOpts };
    this.#relayPool = initRelayPool(opts);

    if (opts.enableDebugLog) {
      this.#logForDebug = console.log;
    }
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
    const opts: Required<FetchOptions> = {
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

    const relays = await this.#relayPool.ensureRelays(relayUrls, opts);

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
              limit: Math.min(opts.limitPerReq, MAX_LIMIT_PER_REQ),
            };
          });

          let numNewEvents = 0;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          for await (const e of this.fetchEventsTillEose(r, refinedFilters, opts)) {
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
    const opts = { ...defaultFetchAllOptions, ...options };

    const res: NostrEvent[] = [];

    const allEvents = await this.allEventsIterator(relayUrls, filters, timeRangeFilter, opts);
    for await (const ev of allEvents) {
      res.push(ev);
    }

    // sort events in "newest to oldest" order if `sort` options is specified
    if (opts.sort) {
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
    options: FetchOptions = {}
  ): Promise<NostrEvent[]> {
    const opts: Required<FetchOptions> = {
      ...defaultFetchOptions,
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

    const relays = await this.#relayPool.ensureRelays(relayUrls, opts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = Math.floor(Date.now() / 1000);

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

          for await (const e of this.fetchEventsTillEose(r, refinedFilters, opts)) {
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

    // collect events from relays, then return latest `limit` events
    const evs: NostrEvent[] = [];
    for await (const ev of chIter) {
      evs.push(ev);
    }
    evs.sort((a, b) => b.created_at - a.created_at);
    return evs.slice(0, limit);
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
    options: FetchOptions = {}
  ): Promise<NostrEvent | undefined> {
    const latest1 = await this.fetchLatestEvents(relayUrls, filters, 1, options);
    return latest1[0];
  }

  private fetchEventsTillEose(
    relay: Relay,
    filters: Filter[],
    subOpts: SubscriptionOptions
  ): AsyncIterable<NostrEvent> {
    const [tx, chIter] = Channel.make<NostrEvent>();

    const onNotice = (n: unknown) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));

      relay.off("notice", onNotice);
      relay.off("error", onError);
    };
    const onError = () => {
      tx.error(Error("ERROR"));

      relay.off("notice", onNotice);
      relay.off("error", onError);
    };
    relay.on("notice", onNotice);
    relay.on("error", onError);

    // prepare a subscription
    const sub = relay.prepareSub(filters, subOpts);
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
    });
    sub.on("eose", () => {
      sub.close();
      relay.off("notice", onNotice);
      relay.off("error", onError);

      tx.close();
    });

    // start the subscription
    sub.req();

    return chIter;
  }

  public shutdown() {
    this.#relayPool.closeAll();
  }
}
