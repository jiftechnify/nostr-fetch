import { Channel, Deferred } from "@nostr-fetch/kernel/channel";
import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import { DebugLogger, LogLevel } from "@nostr-fetch/kernel/debugLogger";
import type { FetchTillEoseOptions, NostrFetcherBase } from "@nostr-fetch/kernel/fetcherBase";
import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { abbreviate, currUnixtimeSec } from "@nostr-fetch/kernel/utils";

import { DefaultFetcherBase } from "./fetcherBase";

export type FetchFilter = Omit<Filter, "limit" | "since" | "until">;
export type FetchTimeRangeFilter = Pick<Filter, "since" | "until">;

export type FetcherInitOptions = {
  minLogLevel?: LogLevel;
};

const defaultFetcherInitOptions: Required<FetcherInitOptions> = {
  minLogLevel: "none",
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

/**
 * Type of errors that can be thrown from methods of `NostrFetcher`.
 */
export class NostrFetchError extends Error {
  static {
    this.prototype.name = "NostrFetchError";
  }
}

export class NostrFetcher {
  // #relayPool: RelayPoolHandle;
  #fetcherBase: NostrFetcherBase;
  #debugLogger: DebugLogger | undefined;

  private constructor(fetcherBase: NostrFetcherBase, initOpts: Required<FetcherInitOptions>) {
    this.#fetcherBase = fetcherBase;

    if (initOpts.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(initOpts.minLogLevel);
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
   * Throws {@linkcode NostrFetchError} if any of `relayUrls` and `filters` is empty.
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
    // assertion
    validateReq({ relayUrls, filters }, [
      checkIfNonEmpty((r) => r.relayUrls, "Specify at least 1 relay URL"),
      checkIfNonEmpty((r) => r.filters, "Specify at least 1 filter"),
    ]);

    const finalOpts: Required<FetchOptions> = {
      ...defaultFetchOptions,
      ...options,
    };
    this.#debugLogger?.log("verbose", "finalOpts: %O", finalOpts);

    const connectedRelayUrls = await this.#fetcherBase.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = timeRangeFilter.until ?? currUnixtimeSec();

    // fetch events from each relay
    Promise.all(
      connectedRelayUrls.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. the relay didn't return new event
        // 2. aborted by AbortController

        const logger = this.#debugLogger?.subLogger(rurl);

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
          logger?.log("verbose", "refinedFilters: %O", refinedFilters);

          let gotNewEvent = false;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          for await (const e of this.#fetcherBase.fetchTillEose(rurl, refinedFilters, finalOpts)) {
            // eliminate duplicated events
            if (!localSeenEventIds.has(e.id)) {
              gotNewEvent = true;
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

          if (!gotNewEvent) {
            // termination contidion 1
            this.#debugLogger?.log("info", `[${rurl}] got ${localSeenEventIds.size} events`);
            break;
          }
          if (finalOpts.abortSignal?.aborted) {
            // termination contidion 2
            this.#debugLogger?.log("info", `[${rurl}] aborted`);
            break;
          }

          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
        }
      })
    ).then(() => {
      // all subscription loops have been terminated
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
   * Throws {@linkcode NostrFetchError} if any of `relayUrls` and `filters` is empty.
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
    // assertion
    validateReq({ relayUrls, filters }, [
      checkIfNonEmpty((r) => r.relayUrls, "Specify at least 1 relay URL"),
      checkIfNonEmpty((r) => r.filters, "Specify at least 1 filter"),
    ]);

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
   * Throws {@linkcode NostrFetchError} if any of `relayUrls` and `filters` is empty or `limit` is negative.
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
    // assertion
    validateReq({ relayUrls, filters, limit }, [
      checkIfNonEmpty((r) => r.relayUrls, "Specify at least 1 relay URL"),
      checkIfNonEmpty((r) => r.filters, "Specify at least 1 filter"),
      (r) => (r.limit <= 0 ? '"limit" should be positive number' : undefined),
    ]);

    const finalOpts: Required<FetchLatestOptions> = {
      ...defaultFetchLatestOptions,
      ...options,
    };
    this.#debugLogger?.log("verbose", "finalOpts: %O", finalOpts);

    // options for subscription
    const subOpts: FetchTillEoseOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };

    const connectedRelayUrls = await this.#fetcherBase.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEventIds = new Set<string>();
    const initialUntil = currUnixtimeSec();

    // fetch at most `limit` events from each relay
    Promise.all(
      connectedRelayUrls.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. got enough amount of events
        // 2. the relay didn't return new event
        // 3. aborted by AbortController

        const logger = this.#debugLogger?.subLogger(rurl);

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
          logger?.log("verbose", "refinedFilters: %O", refinedFilters);

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

          remainingLimit -= numNewEvents;
          if (numNewEvents === 0 || remainingLimit <= 0) {
            // termination condition 1, 2
            this.#debugLogger?.log("info", `[${rurl}] got ${localSeenEventIds.size} events`);
            break;
          }
          if (finalOpts.abortSignal?.aborted) {
            // termination condition 3
            this.#debugLogger?.log("info", `[${rurl}] aborted`);
            break;
          }

          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
        }
      })
    ).then(() => {
      // all subnscription loops have been terminated
      tx.close();
    });

    // collect events from relays. events are already deduped
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
    const verified: NostrEvent[] = [];
    for (const ev of evs) {
      if (verifyEventSig(ev)) {
        verified.push(ev);
        if (verified.length >= limit) {
          break;
        }
      }
    }
    return verified;
  }

  /**
   * Fetches the last event matching the filters from Nostr relays specified by the array of URLs.
   *
   * Returns `undefined` if no event matching the filters exists in any relay.
   *
   * Throws {@linkcode NostrFetchError} if any of `relayUrls` and `filters` is empty.
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
      ...{
        // override default value of `abortSubBeforeEoseTimeoutMs` (10000 -> 1000)
        abortSubBeforeEoseTimeoutMs: 1000,
        ...options,
      },
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
    this.#debugLogger?.log("verbose", "finalOpts: %O", finalOpts);

    // options for subscription
    const subOpts: FetchTillEoseOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };

    const connectedRelayUrls = await this.#fetcherBase.ensureRelays(relayUrls, finalOpts);

    const [tx, chIter] = Channel.make<{ author: string; events: NostrEvent[] }>();
    const initialUntil = currUnixtimeSec();

    // for each pair of author and relay URL, create a promise that act as "latch", so that the "merger" can wait for a subscription to complete
    const latches = new KeyRelayMatrix(
      authors,
      connectedRelayUrls,
      () => new Deferred<NostrEvent[]>()
    );

    // the "fetcher" fetches events from each relay
    Promise.all(
      connectedRelayUrls.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. have fetched required number of events for all authors
        // 2. the relay didn't return new event
        // 3. aborted by AbortController

        const logger = this.#debugLogger?.subLogger(rurl);

        let nextUntil = initialUntil;
        const evBucketsPerAuthor = new EventBuckets(authors, limit);
        const localSeenEventIds = new Set<string>();

        // procedure to complete the subscription in the middle on early return, resolving all remaining promises.
        // resolve() is called even if a Promise is already resolved, but it's not a problem.
        const resolveAllOnEarlyReturn = () => {
          for (const pk of authors) {
            logger?.log("verbose", `resolving bucket on early return: author=${pk}`);
            latches.get(pk, rurl)?.resolve(evBucketsPerAuthor.getBucket(pk) ?? []);
          }
        };

        while (true) {
          const { keys: nextAuthors, limit: nextLimit } =
            evBucketsPerAuthor.calcKeysAndLimitForNextReq();

          if (nextAuthors.length === 0) {
            // termination condition 1
            logger?.log("verbose", `fulfilled buckets for all authors`);
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
          logger?.log("verbose", `refinedFilters=%O`, refinedFilters);

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
                latches.get(e.pubkey, rurl)?.resolve(addRes.events);
                logger?.log("verbose", `fulfilled a bucket for author=${e.pubkey}`);
              }
            }
          }

          if (!gotNewEvent) {
            // termination condition 2
            logger?.log("info", `got ${localSeenEventIds.size} events`);
            resolveAllOnEarlyReturn();
            break;
          }
          if (finalOpts.abortSignal?.aborted) {
            // termination condition 3
            logger?.log("info", `aborted`);
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
        const logger = this.#debugLogger?.subLogger(abbreviate(pubkey, 6));

        // wait for all the buckets for the author to fulfilled
        const evsPerRelay = await Promise.all(
          latches.itemsByKey(pubkey)?.map((d) => d.promise) ?? []
        );
        logger?.log("verbose", `fulfilled all buckets for this author`);

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
          // return latest `limit` events if not "reduced verification mode"
          if (finalOpts.skipVerification || !finalOpts.reduceVerification) {
            return evsDeduped.slice(0, limit);
          }

          // reduced verification: return latest `limit` events whose signature is valid
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
        })();
        tx.send({ author: pubkey, events: res });
      })
    ).then(() => {
      // finished to fetch events for all authors
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
   * Cleans up all the internal states of the fetcher.
   */
  public shutdown() {
    this.#fetcherBase.shutdown();
  }
}

/**
 * Validates `req` by `validators`.
 *
 * If there are something wrong, throws error that includes all error messages from validators.
 */
const validateReq = <T>(req: T, validators: ((req: T) => string | undefined)[]): void => {
  const errors = [];
  for (const validate of validators) {
    const err = validate(req);
    if (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    const lines = errors.map((e) => `- ${e}`).join("\n");
    throw new NostrFetchError(`Invalid request!\n${lines}`);
  }
};

function checkIfNonEmpty<T, U>(
  getArray: (req: T) => U[],
  msg: string
): (req: T) => string | undefined {
  return (req: T): string | undefined => (getArray(req).length === 0 ? msg : undefined);
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
