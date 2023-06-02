import { Channel, Deferred } from "@nostr-fetch/kernel/channel";
import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import type { FetchTillEoseOptions, NostrFetcherBase } from "@nostr-fetch/kernel/fetcherBase";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { currUnixtimeSec, normalizeRelayUrls } from "@nostr-fetch/kernel/utils";

import { DefaultFetcherBase } from "./fetcherBase";

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

export class NostrFetcher {
  // #relayPool: RelayPoolHandle;
  #fetcherBase: NostrFetcherBase;
  #logForDebug: typeof console.log | undefined;

  private constructor(fetcherBase: NostrFetcherBase, initOpts: Required<FetcherInitOptions>) {
    this.#fetcherBase = fetcherBase;

    if (initOpts.enableDebugLog) {
      this.#logForDebug = console.log;
    }
  }

  /**
   * Initializes `NostrFetcher` with the default relay pool implementation.
   */
  public static init(initOpts: FetcherInitOptions = {}): NostrFetcher {
    const finalOpts = { ...defaultFetcherInitOptions, ...initOpts };
    const base = new DefaultFetcherBase(finalOpts);
    return new NostrFetcher(base, finalOpts);
  }

  /**
   * Initializes `NostrFetcher` with the given custom relay pool implementation.
   *
   *
   * @example
   * ```ts
   * const pool = new SimplePool();
   * const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
   * ```
   */
  public static withCustomPool(
    base: NostrFetcherBase,
    initOpts: FetcherInitOptions = {}
  ): NostrFetcher {
    const finalOpts = { ...defaultFetcherInitOptions, ...initOpts };
    return new NostrFetcher(base, finalOpts);
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

    await this.#fetcherBase.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = timeRangeFilter.until ?? currUnixtimeSec();

    Promise.all(
      relayUrls.map(async (rurl) => {
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

          for await (const e of this.#fetcherBase.fetchTillEose(rurl, refinedFilters, finalOpts)) {
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
            this.#logForDebug?.(`[${rurl}] aborted`);
            break;
          }
          if (numNewEvents === 0) {
            this.#logForDebug?.(`[${rurl}] got ${localSeenEventIds.size} events`);
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
      res.sort(createdAtDesc);
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

    await this.#fetcherBase.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = currUnixtimeSec();
    const subOpts: FetchTillEoseOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };

    // fetch at most `limit` events from each relay
    Promise.all(
      relayUrls.map(async (rurl) => {
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

          for await (const e of this.#fetcherBase.fetchTillEose(rurl, refinedFilters, subOpts)) {
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
            this.#logForDebug?.(`[${rurl}] aborted`);
            break;
          }

          remainingLimit -= numNewEvents;
          if (numNewEvents === 0 || remainingLimit <= 0) {
            this.#logForDebug?.(`[${rurl}] got ${localSeenEventIds.size} events`);
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
    evs.sort(createdAtDesc);

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

  /**
   * Fetches latest up to `limit` events **for each author in `authors`** matching the filters, from Nostr relays.
   *
   * Result is an async iterable of `{ author (pubkey), events (from that author) }` pairs.
   *
   * Each array of events in the result are sorted in "newest to oldest" order.
   *
   * Throws {@linkcode NostrFetchError} if any of `relayUrls`, `authors` and `othreFilters` is empty or `limit` is negative.
   *
   * @param relayUrls
   * @param authors
   * @param otherFilters
   * @param limit
   * @param options
   * @returns
   */
  public async fetchLatestEventsPerAuthor(
    relayUrls: string[],
    authors: string[],
    otherFilters: Omit<FetchFilter, "authors">[],
    limit: number,
    options: FetchLatestOptions = {}
  ): Promise<AsyncIterable<{ author: string; events: NostrEvent[] }>> {
    // assertion
    validateReq({ relayUrls, authors, otherFilters, limit }, [
      checkIfNonEmpty((r) => r.relayUrls, "Specify at least 1 relay URL"),
      checkIfNonEmpty((r) => r.authors, "Specify at least 1 author (pubkey)"),
      checkIfNonEmpty((r) => r.otherFilters, "Specify at least 1 filter"),
      (r) => (r.limit <= 0 ? '"limit" should be positive number' : undefined),
    ]);

    const finalOpts = {
      ...defaultFetchLatestOptions,
      ...options,
    };

    const relayUrlsNormalized = normalizeRelayUrls(relayUrls);

    await this.#fetcherBase.ensureRelays(relayUrlsNormalized, finalOpts);

    const initialUntil = currUnixtimeSec();
    const subOpts: FetchTillEoseOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };
    this.#logForDebug?.(finalOpts, subOpts);

    const [tx, chIter] = Channel.make<{ author: string; events: NostrEvent[] }>();

    // for each pair of author and relay URL, create a Promise so that the "merger" can wait for a subscription to complete
    const deferreds = new KeyRelayMatrix(
      authors,
      relayUrlsNormalized,
      () => new Deferred<NostrEvent[]>()
    );

    // the "fetcher" fetches events from each relay
    Promise.all(
      relayUrlsNormalized.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. have fetched required number of events for all authors
        // 2. the relay didn't return new event
        // 3. aborted by AbortController

        let nextUntil = initialUntil;
        const evBucketsPerAuthor = new EventBuckets(authors, limit);
        const localSeenEventIds = new Set<string>();

        // procedure to complete the subscription in the middle on early return, resolving all remaining Promises.
        // resolve() is called even if a Promise is already resolved, but it's not a problem.
        const resolveAllOnEarlyReturn = () => {
          for (const pk of authors) {
            this.#logForDebug?.(`[${rurl}] resolving bucket on early return: author=${pk}`);
            deferreds.get(pk, rurl)?.resolve(evBucketsPerAuthor.getBucket(pk) ?? []);
          }
        };

        while (true) {
          this.#logForDebug?.(`[${rurl}] nextUntil=${nextUntil}`);

          const { keys: nextAuthors, limit: nextLimit } =
            evBucketsPerAuthor.calcKeysAndLimitForNextReq();
          this.#logForDebug?.(
            `[${rurl}] calcKeysAndLimitForNextReq result: authors=${nextAuthors}, limit=${nextLimit}`
          );

          if (nextAuthors.length === 0) {
            // termination condition 1
            this.#logForDebug?.(`[${rurl}] fulfilled buckets for all authors`);
            break;
          }

          const refinedFilters = otherFilters.map((filter) => {
            return {
              ...filter,
              authors: nextAuthors,
              until: nextUntil,
              limit: Math.min(nextLimit, MAX_LIMIT_PER_REQ),
            };
          });
          this.#logForDebug?.(`[${rurl}] refinedFilters=%O`, refinedFilters);

          let gotNewEvent = false;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          for await (const e of this.#fetcherBase.fetchTillEose(rurl, refinedFilters, subOpts)) {
            if (!localSeenEventIds.has(e.id)) {
              gotNewEvent = true;
              localSeenEventIds.add(e.id);

              if (e.created_at < oldestCreatedAt) {
                oldestCreatedAt = e.created_at;
              }

              // add the event to the bucket for the author(pubkey)
              const addRes = evBucketsPerAuthor.add(e.pubkey, e);
              if (addRes.state === "fulfilled") {
                // notify that event fetching is completed for the author at this relay
                // by resolveing the Promise corresponds to the author and the relay
                deferreds.get(e.pubkey, rurl)?.resolve(addRes.events);
                this.#logForDebug?.(`[${rurl}] fulfilled a bucket. author=${e.pubkey}`);
              }
            }
          }

          if (!gotNewEvent) {
            // termination condition 2
            this.#logForDebug?.(`[${rurl}] got ${localSeenEventIds.size} events`);
            resolveAllOnEarlyReturn();
            break;
          }
          if (finalOpts.abortSignal?.aborted) {
            // termination condition 3
            this.#logForDebug?.(`[${rurl}]`);
            resolveAllOnEarlyReturn();
            break;
          }

          nextUntil = oldestCreatedAt + 1;
        }
      })
    );

    // the "merger".
    // merges result from relays, sorts events, takes latest events and sends it to the result channel on all event fetching for a author is completed
    Promise.all(
      authors.map(async (pubkey) => {
        // wait for all the buckets for the author to fulfilled
        const evsPerRelay = await Promise.all(
          deferreds.itemsByKey(pubkey)?.map((d) => d.promise) ?? []
        );
        this.#logForDebug?.(`[${pubkey}] fulfilled all buckets for author`);

        // merge and sort
        const evsDeduped = (() => {
          const res = [];
          const seenIds = new Set();

          for (const evs of evsPerRelay) {
            for (const ev of evs) {
              if (!seenIds.has(ev.id)) {
                res.push(ev);
                seenIds.add(ev.id);
              }
            }
          }
          return res;
        })();
        evsDeduped.sort(createdAtDesc);

        const res = (() => {
          if (finalOpts.skipVerification || !finalOpts.reduceVerification) {
            return evsDeduped.slice(0, limit);
          } else {
            // reduced verification
            const verified = [];
            for (const ev of evsDeduped) {
              if (verifyEventSig(ev)) {
                verified.push(ev);
                if (verified.length >= limit) {
                  break;
                }
              }
            }
            return verified;
          }
        })();
        tx.send({ author: pubkey, events: res });
      })
    ).then(() => {
      tx.close();
    });

    return chIter;
  }

  /**
   * Fetches the last event matching the filters **for each author in `authors`** from Nostr relays.
   *
   * Result is an async iterable of `{ author (pubkey), event }` pairs.
   *
   * `event` in result will be `undefined` if no event matching the filters for the author exists in any relay.
   *
   * Throws {@linkcode NostrFetchError} if any of `relayUrls`, `authors` and `othreFilters` is empty.
   *
   * @param relayUrls
   * @param authors
   * @param otherFilters
   * @param options
   * @returns
   */
  public async fetchLastEventPerAuthor(
    relayUrls: string[],
    authors: string[],
    otherFilters: Omit<FetchFilter, "authors">[],
    options: FetchLatestOptions = {}
  ): Promise<AsyncIterable<{ author: string; event: NostrEvent | undefined }>> {
    const finalOpts: FetchLatestOptions & { abortSubBeforeEoseTimeoutMs: number } = {
      ...defaultFetchLatestOptions,
      ...{
        // override default value of `abortSubBeforeEoseTimeoutMs` (10000 -> 1000)
        abortSubBeforeEoseTimeoutMs: 1000,
        ...options,
      },
    };

    const latest1Iter = await this.fetchLatestEventsPerAuthor(
      relayUrls,
      authors,
      otherFilters,
      1,
      finalOpts
    );
    const mapped = async function* () {
      for await (const { author, events } of latest1Iter) {
        yield { author, event: events[0] };
      }
    };
    return mapped();
  }

  /**
   * Closes all the connections to relays and clean up the internal relay pool.
   */
  public shutdown() {
    this.#fetcherBase.closeAll();
  }
}


/**
 * comparator represents descending order by `created_at` of events (a.k.a. "newest to oldest" order)
 */
const createdAtDesc = (a: NostrEvent, b: NostrEvent): number => b.created_at - a.created_at;

// type of a result of EventBuckets#add
type EventBucketAddResult =
  | { state: "open" }
  | { state: "fulfilled"; events: NostrEvent[] }
  | { state: "dropped" };

/**
 * Set of event buckets for each `key`, with limit on the number of events.
 */
class EventBuckets<K> {
  #buckets: Map<K, NostrEvent[]>;
  #limitPerKey: number;

  constructor(keys: K[], limit: number) {
    this.#buckets = new Map(keys.map((k) => [k, []]));
    this.#limitPerKey = limit;
  }

  public getBucket(key: K): NostrEvent[] | undefined {
    return this.#buckets.get(key);
  }

  /**
   * Adds an event (`ev`) to the bucket for `key` if there is space.
   *
   * Returns a result with `state: "fulfilled"` and events if the bucket is just fulfilled by the addition, otherwise returns `state: "open"`.
   *
   * If the bucket is already full, drops the event and returns `state: "dropped"`.
   */
  public add(key: K, ev: NostrEvent): EventBucketAddResult {
    const bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      console.error(`bucket not found for key: ${key}`);
      return { state: "dropped" };
    }

    if (bucket.length >= this.#limitPerKey) {
      // bucket is already full
      return { state: "dropped" };
    }

    // adding event
    bucket.push(ev);
    if (bucket.length === this.#limitPerKey) {
      // just fulfilled!
      return { state: "fulfilled", events: bucket };
    }
    return { state: "open" };
  }

  /**
   * Calculates keys and limit for next request to a relay.
   *
   * * `keys`: (all keys) - (keys correspond to a full bucket)
   * * `limit`: SUM( #(limit per key) - #(events in bucket) )
   */
  public calcKeysAndLimitForNextReq(): { keys: K[]; limit: number } {
    return [...this.#buckets.entries()].reduce(
      ({ keys, limit }, [key, bucket]) => {
        const numEvents = bucket.length;
        return {
          keys: numEvents < this.#limitPerKey ? [...keys, key] : keys,
          limit: limit + (this.#limitPerKey - numEvents),
        };
      },
      { keys: [] as K[], limit: 0 }
    );
  }
}

/**
 * Map from all combinations of `keys` and  `relayUrls` to a value of type `V`.
 *
 * This has additional mapping from `key` in `keys` to array of values.
 */
class KeyRelayMatrix<K extends string | number, V> {
  #matrix: Map<string, V>;
  #byKey: Map<K, V[]>;

  constructor(keys: K[], relayUrls: string[], initVal: () => V) {
    this.#matrix = new Map();
    this.#byKey = new Map(keys.map((k) => [k, []]));

    for (const k of keys) {
      for (const r of relayUrls) {
        const v = initVal();

        this.#matrix.set(this.#getKey(k, r), v);
        this.#byKey.get(k)!.push(v); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      }
    }
  }

  #getKey(key: K, relayUrl: string): string {
    return `${key}|${relayUrl}`;
  }

  public get(key: K, relayUrl: string): V | undefined {
    return this.#matrix.get(this.#getKey(key, relayUrl));
  }

  public itemsByKey(key: K): V[] | undefined {
    return this.#byKey.get(key);
  }
}
