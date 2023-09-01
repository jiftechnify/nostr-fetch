import { Channel, Deferred } from "@nostr-fetch/kernel/channel";
import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBackend,
  NostrFetcherBackendInitializer,
  NostrFetcherCommonOptions,
  defaultFetcherCommonOptions,
  isFetchTillEoseAbortedSignal,
  isFetchTillEoseFailedSignal,
} from "@nostr-fetch/kernel/fetcherBackend";
import { NostrEvent } from "@nostr-fetch/kernel/nostr";
import { abbreviate, currUnixtimeSec, normalizeRelayUrlSet } from "@nostr-fetch/kernel/utils";

import { DefaultFetcherBackend } from "./fetcherBackend";
import {
  EventBuckets,
  FetchStatsManager,
  KeyRelayMatrix,
  ProgressTracker,
  RelayCapCheckerInitializer,
  RelayCapabilityChecker,
  assertReq,
  checkIfNonEmpty,
  checkIfTimeRangeIsValid,
  checkIfTrue,
  createdAtDesc,
  getKeysOfEvent,
  initDefaultRelayCapChecker,
  initSeenEvents,
} from "./fetcherHelper";
import {
  FetchFilter,
  FetchFilterKeyElem,
  FetchFilterKeyName,
  FetchStatsListener,
  FetchTimeRangeFilter,
  NostrFetchError,
} from "./types";

const MAX_LIMIT_PER_REQ = 5000;
const MAX_LIMIT_PER_REQ_IN_BACKPRESSURE = 500;

const MIN_HIGH_WATER_MARK = 5000;

/**
 * Nostr event with extra fields.
 */
export type NostrEventExt<SeenOn extends boolean = false> = NostrEvent & {
  seenOn: SeenOn extends true ? string[] : undefined;
};

/**
 * Pair of the "key" of events and list of events which have that key.
 *
 * It is the type of elements of `AsyncIterable` returned from {@linkcode NostrFetcher.fetchLatestEventsPerKey}.
 */
export type NostrEventListWithKey<K extends FetchFilterKeyName, SeenOn extends boolean> = {
  key: FetchFilterKeyElem<K>;
  events: NostrEventExt<SeenOn>[];
};

/**
 * Pair of the "key" of an event and the event which has that key. If no event found matching the key, it will be `undefined`.
 *
 * It is the type of elements of `AsyncIterable` returned from {@linkcode NostrFetcher.fetchLastEventPerKey}.
 */
export type NostrEventWithKey<K extends FetchFilterKeyName, SeenOn extends boolean> = {
  key: FetchFilterKeyElem<K>;
  event: NostrEventExt<SeenOn> | undefined;
};

/**
 * Pair of the pubkey of event author and list of events from that author.
 *
 * It is the type of elements of `AsyncIterable` returned from {@linkcode NostrFetcher.fetchLatestEventsPerAuthor}.
 */
export type NostrEventListWithAuthor<SeenOn extends boolean> = {
  author: string;
  events: NostrEventExt<SeenOn>[];
};

/**
 * Pair of the pubkye of event author and an event from that author. If no event found from the author, it will be `undefined`.
 *
 * It is the type of elements of `AsyncIterable` returned from {@linkcode NostrFetcher.fetchLastEventPerAuthor}.
 */
export type NostrEventWithAuthor<SeenOn extends boolean> = {
  author: string;
  event: NostrEventExt<SeenOn> | undefined;
};

/**
 * Common options for all the fetch methods.
 */
export type FetchOptions<SeenOn extends boolean = false> = {
  /**
   * If true, the fetcher skips event signature verification.
   *
   * Note: This option has no effect under some relay pool adapters.
   * Check the document of the relay pool adapter you want to use.
   *
   * @default false
   */
  skipVerification?: boolean;

  /**
   * If true, `seenOn` property is appeded to every returned events.
   * The value of `seenOn` is array of relay URLs on which the event have been seen.
   *
   * @default false
   */
  withSeenOn?: SeenOn;

  /**
   * The function for listening fetch statistics.
   *
   * @default undefined
   */
  statsListener?: FetchStatsListener | undefined;

  /**
   * How often fetch statistics is notified to the listener (specified via `statsListener`), in milliseconds.
   *
   * @default 1000
   */
  statsNotifIntervalMs?: number;

  /**
   * The maximum amount of time allowed to attempt to connect to relays, in milliseconds.
   *
   * @default 5000
   */
  connectTimeoutMs?: number;

  /**
   * The `AbortSignal` used to abort an event fetching.
   *
   * @default undefined
   */
  abortSignal?: AbortSignal | undefined;

  /**
   * The maximum amount of time to wait for events from relay before a subscription is automatically aborted before EOSE, in milliseconds.
   *
   * @default 10000
   */
  abortSubBeforeEoseTimeoutMs?: number;

  /**
   * `limit` value to be used in internal subscriptions.
   * You may want to lower this value if relays you use have limit on value of `limit`.
   *
   * @default 5000
   */
  limitPerReq?: number;
};

const defaultFetchOptions: Required<FetchOptions> = {
  skipVerification: false,
  withSeenOn: false,
  statsListener: undefined,
  statsNotifIntervalMs: 1000,
  connectTimeoutMs: 5000,
  abortSignal: undefined,
  abortSubBeforeEoseTimeoutMs: 10000,
  limitPerReq: MAX_LIMIT_PER_REQ,
};

/**
 * Options for {@linkcode NostrFetcher.allEventsIterator}.
 */
export type AllEventsIterOptions<SeenOn extends boolean = false> = FetchOptions<SeenOn> & {
  /**
   * If true, the backpressure mode is enabled.
   *
   * In the backpressure mode, a fetcher is automatically slowed down when the consumer of events is slower than the fetcher (producer of events).
   *
   * This feature may be useful for jobs like transferring events from relays to other relays.
   *
   * @default false
   */
  enableBackpressure?: boolean;
};

const defaultAllEventsIterOptions: Required<AllEventsIterOptions> = {
  ...defaultFetchOptions,
  enableBackpressure: false,
};

/**
 * Options for {@linkcode NostrFetcher.fetchAllEvents}.
 */
export type FetchAllOptions<SeenOn extends boolean = false> = FetchOptions<SeenOn> & {
  /**
   * If true, resulting events are sorted in "newest to oldest" order.
   *
   * @default false
   */
  sort?: boolean;
};

const defaultFetchAllOptions: Required<FetchAllOptions> = {
  ...defaultFetchOptions,
  sort: false,
};

/**
 * Options for "fetch latest N events" kind of fetchers, such as {@linkcode NostrFetcher.fetchLatestEvents}.
 */
export type FetchLatestOptions<SeenOn extends boolean = false> = FetchOptions<SeenOn> & {
  /**
   * Takes unixtime in second.  If specified, fetch latest events **as of the time**.
   *
   * Note: it is useful only for fetching *regular* events. Using this for replaceable events will result in an unexpected behavior.
   */
  asOf?: number | undefined;

  /**
   * If true, the "reduced verification" mode is enabled.
   *
   * In the reduced verification mode, event signature verification is performed only to minimum amount of events enough to ensure validity.
   *
   * @default false
   */
  reduceVerification?: boolean;
};

const defaultFetchLatestOptions: Required<FetchLatestOptions> = {
  ...defaultFetchOptions,
  asOf: undefined,
  reduceVerification: true,
};

/**
 * Type of the first argument of {@linkcode NostrFetcher.fetchLatestEventsPerAuthor}/{@linkcode NostrFetcher.fetchLastEventPerAuthor}.
 */
export type KeysAndRelays<K extends FetchFilterKeyName> =
  | {
      keys: FetchFilterKeyElem<K>[];
      relayUrls: string[];
    }
  | Iterable<[key: FetchFilterKeyElem<K>, relayUrls: string[]]>;

/**
 * Use same relay set for all authors
 */
type RelaySetForAllKeys<K extends FetchFilterKeyName> = {
  keys: FetchFilterKeyElem<K>[];
  relayUrls: string[];
};

/**
 * Use saperate relay set for each author.  Typically `Map<string, string[]>`
 */
type RelaySetsPerKey<K extends FetchFilterKeyName> = Iterable<
  [key: FetchFilterKeyElem<K>, relayUrls: string[]]
>;

const isRelaySetForAllKeys = <K extends FetchFilterKeyName>(
  kr: KeysAndRelays<K>,
): kr is RelaySetForAllKeys<K> => {
  return "relayUrls" in kr && "keys" in kr;
};
const isRelaySetsPerKey = <K extends FetchFilterKeyName>(
  kr: KeysAndRelays<K>,
): kr is RelaySetsPerKey<K> => {
  return Symbol.iterator in Object(kr);
};

/**
 * Type of the first argument of {@linkcode NostrFetcher.fetchLatestEventsPerAuthor}/{@linkcode NostrFetcher.fetchLastEventPerAuthor}.
 */
export type AuthorsAndRelays = RelaySetForAllAuthors | RelaySetsPerAuthor;

/**
 * Use same relay set for all authors
 */
type RelaySetForAllAuthors = {
  authors: string[];
  relayUrls: string[];
};

/**
 * Use saperate relay set for each author.  Typically `Map<string, string[]>`
 */
type RelaySetsPerAuthor = Iterable<[author: string, relayUrls: string[]]>;

const isRelaySetForAllAuthors = (a2rs: AuthorsAndRelays): a2rs is RelaySetForAllAuthors => {
  return "relayUrls" in a2rs && "authors" in a2rs;
};
const isRelaySetsPerAuthor = (a2rs: AuthorsAndRelays): a2rs is RelaySetsPerAuthor => {
  return Symbol.iterator in Object(a2rs);
};

const adaptAuthorsAndRelays = (ar: AuthorsAndRelays): KeysAndRelays<"authors"> => {
  if (isRelaySetForAllAuthors(ar)) {
    return { keys: ar.authors, relayUrls: ar.relayUrls };
  }
  if (isRelaySetsPerAuthor(ar)) {
    return ar;
  }
  throw Error("adaptAuthorsAndRelays: unreachable");
};

/**
 * The entry point of the Nostr event fetching.
 *
 * It sits on top of a Nostr relay pool implementation which manages connections to Nostr relays. It is recommended to reuse single `NostrFetcher` instance in entire app.
 *
 * You must instantiate `NostrFetcher` with static methods like {@linkcode NostrFetcher.init} or {@linkcode NostrFetcher.withCustomPool} instead of the constructor.
 */
export class NostrFetcher {
  #backend: NostrFetcherBackend;
  #relayCapChecker: RelayCapabilityChecker;
  #debugLogger: DebugLogger | undefined;

  private constructor(
    backend: NostrFetcherBackend,
    relayCapChecker: RelayCapabilityChecker,
    initOpts: Required<NostrFetcherCommonOptions>,
  ) {
    this.#backend = backend;
    this.#relayCapChecker = relayCapChecker;

    if (initOpts.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(initOpts.minLogLevel);
    }
  }

  /**
   * Initializes {@linkcode NostrFetcher} with the default relay pool implementation.
   */
  public static init(
    options: NostrFetcherCommonOptions = {},
    initRelayCapChecker: RelayCapCheckerInitializer = initDefaultRelayCapChecker,
  ): NostrFetcher {
    const finalOpts = { ...defaultFetcherCommonOptions, ...options };
    const backend = new DefaultFetcherBackend(finalOpts);
    const relayCapChecker = initRelayCapChecker(finalOpts);
    return new NostrFetcher(backend, relayCapChecker, finalOpts);
  }

  /**
   * Initializes {@linkcode NostrFetcher} with the given adapted custom relay pool implementation.
   *
   * @example
   * ```ts
   * const pool = new SimplePool();
   * const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
   * ```
   */
  public static withCustomPool(
    poolAdapter: NostrFetcherBackendInitializer,
    options: NostrFetcherCommonOptions = {},
    initRelayCapChecker: RelayCapCheckerInitializer = initDefaultRelayCapChecker,
  ): NostrFetcher {
    const finalOpts = { ...defaultFetcherCommonOptions, ...options };
    const relayCapChecker = initRelayCapChecker(finalOpts);
    return new NostrFetcher(poolAdapter(finalOpts), relayCapChecker, finalOpts);
  }

  async #ensureRelaysWithCapCheck(
    relayUrls: string[],
    opts: EnsureRelaysOptions,
    requiredNips: number[],
  ): Promise<string[]> {
    const connectedRelays = await this.#backend.ensureRelays(relayUrls, opts);

    if (requiredNips.length === 0) {
      // if capability check is not needed, return early
      return connectedRelays;
    }

    this.#debugLogger?.log("info", `required NIPs: ${requiredNips}`);

    const res: string[] = [];
    await Promise.all(
      connectedRelays.map(async (rurl) => {
        if (await this.#relayCapChecker.relaySupportsNips(rurl, requiredNips)) {
          res.push(rurl);
        }
      }),
    );

    this.#debugLogger?.log("info", `eligible relays: ${res}`);
    return res;
  }

  #calcRequiredNips(filter: { search?: string }): number[] {
    const res: number[] = [];
    if ("search" in filter) {
      res.push(50); // NIP-50: Search Capability
    }
    return res;
  }

  /**
   * Returns an async iterable of all events matching the filter from Nostr relays specified by the array of URLs.
   *
   * You can iterate over events using `for-await-of` loop.
   *
   * Note: there are no guarantees about the order of returned events.
   *
   * Throws {@linkcode NostrFetchError} if `timeRangeFilter` is invalid (`since` > `until`).
   */
  public allEventsIterator<SeenOn extends boolean = false>(
    relayUrls: string[],
    filter: FetchFilter,
    timeRangeFilter: FetchTimeRangeFilter,
    options: AllEventsIterOptions<SeenOn> = {},
  ): AsyncIterable<NostrEventExt<SeenOn>> {
    assertReq(
      { relayUrls, timeRangeFilter },
      [
        checkIfNonEmpty((r) => r.relayUrls, "warn", "Specify at least 1 relay URL"),
        checkIfTimeRangeIsValid(
          (r) => r.timeRangeFilter,
          "error",
          "Invalid time range (since > until)",
        ),
      ],
      this.#debugLogger,
    );

    const filledOpts = {
      ...defaultAllEventsIterOptions,
      ...options,
    } as Required<AllEventsIterOptions<SeenOn>>;

    // use smaller limit if backpressure is enabled
    const finalOpts: Required<AllEventsIterOptions<SeenOn>> = {
      ...filledOpts,
      limitPerReq: filledOpts.enableBackpressure
        ? Math.min(filledOpts.limitPerReq, MAX_LIMIT_PER_REQ_IN_BACKPRESSURE)
        : filledOpts.limitPerReq,
    };
    this.#debugLogger?.log("verbose", "finalOpts=%O", finalOpts);

    return this.#allEventsIterBody(relayUrls, filter, timeRangeFilter, finalOpts);
  }

  async *#allEventsIterBody<SeenOn extends boolean>(
    relayUrls: string[],
    filter: FetchFilter,
    timeRangeFilter: FetchTimeRangeFilter,
    options: Required<AllEventsIterOptions<SeenOn>>,
  ): AsyncIterable<NostrEventExt<SeenOn>> {
    const statsMngr = FetchStatsManager.init(options.statsListener, options.statsNotifIntervalMs);

    const reqNips = this.#calcRequiredNips(filter);
    const eligibleRelayUrls = await this.#ensureRelaysWithCapCheck(relayUrls, options, reqNips);

    const highWaterMark = options.enableBackpressure
      ? Math.max(options.limitPerReq * eligibleRelayUrls.length, MIN_HIGH_WATER_MARK)
      : undefined;

    const [tx, chIter] = Channel.make<NostrEventExt<SeenOn>>({ highWaterMark });
    const globalSeenEvents = initSeenEvents(options.withSeenOn);
    const initialUntil = timeRangeFilter.until ?? currUnixtimeSec();

    // codes for tracking progress
    // if `since` is undefined, duration is infinite (represented by undefined)
    const timeRangeDur =
      timeRangeFilter.since !== undefined
        ? Math.max(initialUntil - timeRangeFilter.since + 1, 1)
        : undefined;
    const progTracker = new ProgressTracker(eligibleRelayUrls);
    statsMngr?.setProgressMax(eligibleRelayUrls.length);
    statsMngr?.initRelayStats(relayUrls, eligibleRelayUrls, initialUntil);

    // fetch events from each relay
    Promise.all(
      eligibleRelayUrls.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. the relay didn't return new event
        // 2. aborted by AbortController
        // E. an error occurred while fetching events

        const logger = this.#debugLogger?.subLogger(rurl);

        let nextUntil = initialUntil;
        const localSeenEventIds = new Set<string>();

        while (true) {
          const refinedFilter = {
            ...timeRangeFilter,
            ...filter,
            until: nextUntil,
            // relays are supposed to return *latest* events by specifying `limit` explicitly (cf. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
            // nostream doesn't accept a filter which has `limit` grater than 5000, so limit `limit` to this threshold or less.
            limit: Math.min(options.limitPerReq, MAX_LIMIT_PER_REQ),
          };
          logger?.log("verbose", "refinedFilter=%O", refinedFilter);

          let gotNewEvent = false;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          let isAboutToAbort = false;

          try {
            statsMngr?.subOpened();
            for await (const e of this.#backend.fetchTillEose(rurl, refinedFilter, options)) {
              // eliminate duplicated events
              if (!localSeenEventIds.has(e.id)) {
                // hasn't seen the event on this relay
                gotNewEvent = true;
                localSeenEventIds.add(e.id);
                if (e.created_at < oldestCreatedAt) {
                  oldestCreatedAt = e.created_at;
                }

                const { hasSeen, seenOn } = globalSeenEvents.report(e, rurl);
                // `withSeenOn`: true  -> send the event even if it has already been seen in order to update seenOn
                // `withSeenOn`: false -> send the event only if it hasn't been seen yet
                if (options.withSeenOn || !hasSeen) {
                  tx.send({ ...e, seenOn });
                }

                statsMngr?.eventFetched(rurl);
                statsMngr?.setNumBufferedEvents(tx.numBufferedItems());
              }
            }
          } catch (err) {
            if (isFetchTillEoseFailedSignal(err)) {
              // an error occurred while fetching events
              logger?.log("error", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              break;
            }
            if (isFetchTillEoseAbortedSignal(err)) {
              // fetch aborted
              logger?.log("info", err.message);
              isAboutToAbort = true;
            } else {
              logger?.log("error", "unexpected error:", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              break;
            }
          } finally {
            statsMngr?.subClosed();
          }

          if (!gotNewEvent) {
            // termination contidion 1
            logger?.log("info", `got ${localSeenEventIds.size} events`);
            statsMngr?.setRelayStatus(rurl, isAboutToAbort ? "aborted" : "completed");
            break;
          }

          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
          statsMngr?.setRelayFrontier(rurl, oldestCreatedAt);

          // update progress
          if (timeRangeDur !== undefined) {
            progTracker.setProgress(rurl, (initialUntil - oldestCreatedAt) / timeRangeDur);
            statsMngr?.setCurrentProgress(progTracker.calcTotalProgress());
          }

          if (options.abortSignal?.aborted) {
            // termination contidion 2
            logger?.log("info", "aborted");
            statsMngr?.setRelayStatus(rurl, "aborted");
            break;
          }

          // receive backpressure: wait until the channel is drained enough
          await tx.waitUntilDrained();
        }
        // subscripton loop for the relay terminated
        progTracker.setProgress(rurl, 1);
        statsMngr?.setCurrentProgress(progTracker.calcTotalProgress());
      }),
    ).then(() => {
      // all subscription loops have been terminated
      tx.close();
      statsMngr?.stop();
    });

    yield* chIter;
  }

  /**
   * Fetches all events matching the filter from Nostr relays specified by the array of URLs,
   * and collect them into an array.
   *
   * Note: there are no guarantees about the order of returned events if `sort` options is not specified.
   *
   * Throws {@linkcode NostrFetchError} if `timeRangeFilter` is invalid (`since` > `until`).
   */
  public async fetchAllEvents<SeenOn extends boolean = false>(
    relayUrls: string[],
    filter: FetchFilter,
    timeRangeFilter: FetchTimeRangeFilter,
    options: FetchAllOptions<SeenOn> = {},
  ): Promise<NostrEventExt<SeenOn>[]> {
    assertReq(
      { relayUrls, timeRangeFilter },
      [
        checkIfNonEmpty((r) => r.relayUrls, "warn", "Specify at least 1 relay URL"),
        checkIfTimeRangeIsValid(
          (r) => r.timeRangeFilter,
          "error",
          "Invalid time range (since > until)",
        ),
      ],
      this.#debugLogger,
    );

    const finalOpts = {
      ...defaultFetchAllOptions,
      ...options,
    } as Required<FetchAllOptions<SeenOn>>;

    const allEvents = this.allEventsIterator(relayUrls, filter, timeRangeFilter, {
      ...finalOpts,
      enableBackpressure: false,
    });

    // collect events
    const res = await (async () => {
      if (finalOpts.withSeenOn) {
        const evs: Map<string, NostrEventExt<SeenOn>> = new Map();
        for await (const ev of allEvents) {
          evs.set(ev.id, ev);
        }
        return [...evs.values()];
      }

      const evs: NostrEventExt<SeenOn>[] = [];
      for await (const ev of allEvents) {
        evs.push(ev);
      }
      return evs;
    })();

    // sort events in "newest to oldest" order if `sort` options is specified
    if (finalOpts.sort) {
      res.sort(createdAtDesc);
    }
    return res;
  }

  /**
   * Fetches latest events matching the filter from Nostr relays specified by the array of URLs.
   *
   * Events are sorted in "newest to oldest" order.
   *
   * Throws {@linkcode NostrFetchError} if `limit` is a non-positive number.
   */
  public async fetchLatestEvents<SeenOn extends boolean = false>(
    relayUrls: string[],
    filter: FetchFilter,
    limit: number,
    options: FetchLatestOptions<SeenOn> = {},
  ): Promise<NostrEventExt<SeenOn>[]> {
    assertReq(
      { relayUrls, limit },
      [
        checkIfNonEmpty((r) => r.relayUrls, "warn", "Specify at least 1 relay URL"),
        checkIfTrue((r) => r.limit > 0, "error", '"limit" should be positive number'),
      ],
      this.#debugLogger,
    );

    const finalOpts = {
      ...defaultFetchLatestOptions,
      ...options,
    } as Required<FetchLatestOptions<SeenOn>>;
    this.#debugLogger?.log("verbose", "finalOpts=%O", finalOpts);

    // options for subscription
    const subOpts: FetchTillEoseOptions = {
      ...finalOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: finalOpts.skipVerification || finalOpts.reduceVerification,
    };

    const statsMngr = FetchStatsManager.init(
      finalOpts.statsListener,
      finalOpts.statsNotifIntervalMs,
    );

    const reqNips = this.#calcRequiredNips(filter);
    const eligibleRelayUrls = await this.#ensureRelaysWithCapCheck(relayUrls, finalOpts, reqNips);

    const [tx, chIter] = Channel.make<NostrEvent>();
    const globalSeenEvents = initSeenEvents(finalOpts.withSeenOn);
    const initialUntil = finalOpts.asOf ?? currUnixtimeSec();

    const progTracker = new ProgressTracker(eligibleRelayUrls);
    statsMngr?.setProgressMax(eligibleRelayUrls.length * limit);
    statsMngr?.initRelayStats(relayUrls, eligibleRelayUrls, initialUntil);

    // fetch at most `limit` events from each relay
    Promise.all(
      eligibleRelayUrls.map(async (rurl) => {
        // repeat subscription until one of the following conditions is met:
        // 1. got enough amount of events
        // 2. the relay didn't return new event
        // 3. aborted by AbortController
        // E. an error occurred while fetching events

        const logger = this.#debugLogger?.subLogger(rurl);

        let nextUntil = initialUntil;
        let remainingLimit = limit;
        const localSeenEventIds = new Set<string>();

        while (true) {
          const refinedFilter = {
            ...filter,
            until: nextUntil,
            // relays are supposed to return *latest* events by specifying `limit` explicitly (cf. [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)).
            // nostream doesn't accept a filter which has `limit` grater than 5000, so limit `limit` to this threshold or less.
            limit: Math.min(remainingLimit, MAX_LIMIT_PER_REQ),
          };
          logger?.log("verbose", "refinedFilter=%O", refinedFilter);

          let numNewEvents = 0;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          let isAboutToAbort = false;

          try {
            statsMngr?.subOpened();
            for await (const e of this.#backend.fetchTillEose(rurl, refinedFilter, subOpts)) {
              // eliminate duplicated events
              if (!localSeenEventIds.has(e.id)) {
                // hasn't seen the event on this relay
                numNewEvents++;
                localSeenEventIds.add(e.id);
                if (e.created_at < oldestCreatedAt) {
                  oldestCreatedAt = e.created_at;
                }

                const { hasSeen } = globalSeenEvents.report(e, rurl);
                if (!hasSeen) {
                  tx.send(e);
                }

                statsMngr?.eventFetched(rurl);
                statsMngr?.setNumBufferedEvents(tx.numBufferedItems());
              }
            }
          } catch (err) {
            if (isFetchTillEoseFailedSignal(err)) {
              // an error occurred while fetching events
              logger?.log("error", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              break;
            }
            if (isFetchTillEoseAbortedSignal(err)) {
              // fetch aborted
              logger?.log("info", err.message);
              isAboutToAbort = true;
            } else {
              logger?.log("error", "unexpected error:", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              break;
            }
          } finally {
            statsMngr?.subClosed();
          }

          progTracker.addProgress(rurl, Math.min(numNewEvents, remainingLimit));
          statsMngr?.setCurrentProgress(progTracker.calcTotalProgress());

          remainingLimit -= numNewEvents;
          if (numNewEvents === 0 || remainingLimit <= 0) {
            // termination condition 1, 2
            logger?.log("info", `got ${localSeenEventIds.size} events`);
            statsMngr?.setRelayStatus(rurl, isAboutToAbort ? "aborted" : "completed");
            break;
          }
          if (finalOpts.abortSignal?.aborted) {
            // termination condition 3
            logger?.log("info", `aborted`);
            statsMngr?.setRelayStatus(rurl, "aborted");
            break;
          }

          // set next `until` to `created_at` of the oldest event returned in this time.
          // `+ 1` is needed to make it work collectly even if we used relays which has "exclusive" behaviour with respect to `until`.
          nextUntil = oldestCreatedAt + 1;
          statsMngr?.setRelayFrontier(rurl, oldestCreatedAt);
        }
        // subscripton loop for the relay terminated
        progTracker.setProgress(rurl, limit);
        statsMngr?.setCurrentProgress(progTracker.calcTotalProgress());
      }),
    ).then(() => {
      // all subnscription loops have been terminated
      tx.close();
      statsMngr?.stop();
    });

    // collect events from relays. events are already deduped
    const evs: NostrEvent[] = [];
    for await (const ev of chIter) {
      evs.push(ev);
    }
    evs.sort(createdAtDesc);

    // take latest events
    const res = (() => {
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
    })();

    if (!finalOpts.withSeenOn) {
      return res as NostrEventExt<SeenOn>[];
    }
    // append "seen on" data to events if `withSeenOn` is true.
    return res.map((e) => {
      return { ...e, seenOn: globalSeenEvents.getSeenOn(e.id) };
    }) as NostrEventExt<SeenOn>[];
  }

  /**
   * Fetches the last event matching the filter from Nostr relays specified by the array of URLs.
   *
   * Returns `undefined` if no event matching the filter exists in any relay.
   */
  public async fetchLastEvent<SeenOn extends boolean = false>(
    relayUrls: string[],
    filter: FetchFilter,
    options: FetchLatestOptions<SeenOn> = {},
  ): Promise<NostrEventExt<SeenOn> | undefined> {
    const finalOpts = {
      ...defaultFetchLatestOptions,
      ...{
        // override default value of `abortSubBeforeEoseTimeoutMs` (10000 -> 1000)
        abortSubBeforeEoseTimeoutMs: 1000,
        ...options,
      },
    } as Required<FetchLatestOptions<SeenOn>>;
    const latest1 = await this.fetchLatestEvents(relayUrls, filter, 1, finalOpts);
    return latest1[0];
  }

  // creates mapping of available relays to keys.
  // returns that mapping and array of all keys.
  async #mapAvailableRelayToKeys<K extends FetchFilterKeyName>(
    kr: KeysAndRelays<K>,
    ensureOpts: EnsureRelaysOptions,
    reqNips: number[],
  ): Promise<
    [
      map: Map<string, FetchFilterKeyElem<K>[]>,
      allKeys: FetchFilterKeyElem<K>[],
      allRelays: string[],
    ]
  > {
    if (isRelaySetForAllKeys(kr)) {
      assertReq(
        kr,
        [
          checkIfNonEmpty((r) => r.relayUrls, "warn", "Specify at least 1 relay URL"),
          checkIfNonEmpty((r) => r.keys as unknown[], "warn", "Specify at least 1 key"),
        ],
        this.#debugLogger,
      );

      const eligibleRelays = await this.#ensureRelaysWithCapCheck(
        kr.relayUrls,
        ensureOpts,
        reqNips,
      );
      return [new Map(eligibleRelays.map((rurl) => [rurl, kr.keys])), kr.keys, kr.relayUrls];
    }

    if (isRelaySetsPerKey(kr)) {
      const krArr = [...kr];
      assertReq(
        krArr,
        [
          checkIfNonEmpty((kr) => kr, "warn", "Specify at least 1 key"),
          checkIfTrue(
            (kr) => kr.every(([, relays]) => relays.length > 0),
            "warn",
            "Specify at least 1 relay URL for all keys",
          ),
        ],
        this.#debugLogger,
      );

      // transpose: key to rurls -> rurl to keys
      const rurl2keys = new Map<string, FetchFilterKeyElem<K>[]>();
      for (const [key, rurls] of krArr) {
        const normalized = normalizeRelayUrlSet(rurls);
        for (const rurl of normalized) {
          const keys = rurl2keys.get(rurl);
          rurl2keys.set(rurl, [...(keys ?? []), key as FetchFilterKeyElem<K>]);
        }
      }
      const allRelays = [...rurl2keys.keys()];
      const eligibleRelays = await this.#ensureRelaysWithCapCheck(allRelays, ensureOpts, reqNips);

      // retain eligible relays only
      return [
        /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
        new Map(eligibleRelays.map((rurl) => [rurl, rurl2keys.get(rurl)!])),
        krArr.map(([key]) => key),
        allRelays,
      ];
    }

    throw new NostrFetchError(
      "malformed first argument for fetchLatestEventsPerKey/fetchLastEventPerKey",
    );
  }

  /**
   * Fetches latest up to `limit` events **for each key specified by `keyName` and `keysAndRelays`**.
   *
   * `keysAndRelays` can be either of two types:
   *
   * - `{ keys: K[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `keys` to fetch events.
   * - `Map<K, string[]>`: Key must be the key of event and value must be relay set for that key. The fetcher will use separate relay set for each key to fetch events.
   *
   * Result is an async iterable of `{ key: <key of events>, events: <events which have that key> }` pairs.
   *
   * Each array of events in the result are sorted in "newest to oldest" order.
   *
   * Throws {@linkcode NostrFetchError} if `limit` is a non-positive number.
   */
  public fetchLatestEventsPerKey<K extends FetchFilterKeyName, SeenOn extends boolean = false>(
    keyName: K,
    keysAndRelays: KeysAndRelays<K>,
    otherFilter: Omit<FetchFilter, K>,
    limit: number,
    options: FetchLatestOptions<SeenOn> = {},
  ): AsyncIterable<NostrEventListWithKey<K, SeenOn>> {
    assertReq(
      { limit },
      [checkIfTrue((r) => r.limit > 0, "error", '"limit" should be positive number')],
      this.#debugLogger,
    );

    const filledOpts = {
      ...defaultFetchLatestOptions,
      ...options,
    } as Required<FetchLatestOptions<SeenOn>>;
    this.#debugLogger?.log("verbose", "finalOpts=%O", filledOpts);

    // options for subscription
    const finalOpts = {
      ...filledOpts,
      // skip "full" verification if `reduceVerification` is enabled
      skipVerification: filledOpts.skipVerification || filledOpts.reduceVerification,
    };

    return this.#fetchLatestEventPerKeyBody(keyName, keysAndRelays, otherFilter, limit, finalOpts);
  }

  async *#fetchLatestEventPerKeyBody<K extends FetchFilterKeyName, SeenOn extends boolean = false>(
    keyName: K,
    keysAndRelays: KeysAndRelays<K>,
    otherFilter: Omit<FetchFilter, K>,
    limit: number,
    options: Required<FetchLatestOptions<SeenOn>>,
  ): AsyncIterable<NostrEventListWithKey<K, SeenOn>> {
    const statsMngr = FetchStatsManager.init(options.statsListener, options.statsNotifIntervalMs);

    // get mapping of available relay to keys and list of all keys
    const reqNips = this.#calcRequiredNips(otherFilter);
    const [relayToKeys, allKeys, allRelays] = await this.#mapAvailableRelayToKeys(
      keysAndRelays,
      options,
      reqNips,
    );
    this.#debugLogger?.log("verbose", "relayToKeys=%O", relayToKeys);

    const [tx, chIter] = Channel.make<NostrEventListWithKey<K, SeenOn>>();
    const globalSeenEvents = initSeenEvents(options.withSeenOn);
    const initialUntil = options.asOf ?? currUnixtimeSec();

    statsMngr?.setProgressMax(allKeys.length);
    statsMngr?.initRelayStats(allRelays, [...relayToKeys.keys()], initialUntil);

    // for each pair of key and relay URL, create a promise that act as "latch", so that the "merger" can wait for a subscription to complete
    const latches = new KeyRelayMatrix(relayToKeys, () => new Deferred<NostrEvent[]>());

    // the "fetcher" fetches events from each relay
    Promise.all(
      [...relayToKeys].map(async ([rurl, keys]) => {
        // repeat subscription until one of the following conditions is met:
        // 1. have fetched required number of events for all keys
        // 2. the relay didn't return new event
        // 3. aborted by AbortController
        // E. an error occurred while fetching events

        const logger = this.#debugLogger?.subLogger(rurl);

        let nextUntil = initialUntil;
        const evBucketsPerKey = new EventBuckets(keys, limit);
        const localSeenEventIds = new Set<string>();

        // procedure to complete the subscription in the middle, resolving all remaining promises.
        // resolve() is called even if a promise is already resolved, but it's not a problem.
        const resolveAllOnEarlyBreak = () => {
          logger?.log("verbose", `resolving bucket on early return`);
          for (const pk of keys) {
            latches.get(pk, rurl)?.resolve(evBucketsPerKey.getBucket(pk) ?? []);
          }
        };

        while (true) {
          const { keys: nextKeys, limit: nextLimit } = evBucketsPerKey.calcKeysAndLimitForNextReq();

          if (nextKeys.length === 0) {
            // termination condition 1
            logger?.log("verbose", `fulfilled buckets for all keys`);
            statsMngr?.setRelayStatus(rurl, "completed");
            break;
          }

          const refinedFilter = {
            ...otherFilter,
            [keyName]: nextKeys,
            until: nextUntil,
            limit: Math.min(nextLimit, MAX_LIMIT_PER_REQ),
          };
          logger?.log("verbose", `refinedFilter=%O`, refinedFilter);

          let gotNewEvent = false;
          let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

          let isAboutToAbort = false;

          try {
            statsMngr?.subOpened();
            for await (const e of this.#backend.fetchTillEose(rurl, refinedFilter, options)) {
              if (!localSeenEventIds.has(e.id)) {
                // hasn't seen the event on this relay
                gotNewEvent = true;
                localSeenEventIds.add(e.id);
                if (e.created_at < oldestCreatedAt) {
                  oldestCreatedAt = e.created_at;
                }

                globalSeenEvents.report(e, rurl);

                // add the event to the bucket for the keys
                for (const evKey of getKeysOfEvent(keyName, e)) {
                  const addRes = evBucketsPerKey.add(evKey, e);
                  if (addRes.state === "fulfilled") {
                    // notify that event fetching is completed for the key at this relay
                    // by resolveing the Promise corresponds to the key and the relay
                    latches.get(evKey, rurl)?.resolve(addRes.events);
                    logger?.log("verbose", `fulfilled a bucket for key=${evKey}`);
                  }
                }

                statsMngr?.eventFetched(rurl);
                statsMngr?.setNumBufferedEvents(tx.numBufferedItems());
              }
            }
          } catch (err) {
            if (isFetchTillEoseFailedSignal(err)) {
              // an error occurred while fetching events
              logger?.log("error", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              resolveAllOnEarlyBreak();
              break;
            }
            if (isFetchTillEoseAbortedSignal(err)) {
              // fetch aborted
              logger?.log("info", err.message);
              isAboutToAbort = true;
            } else {
              logger?.log("error", "unexpected error:", err);
              statsMngr?.setRelayStatus(rurl, "failed");
              resolveAllOnEarlyBreak();
              break;
            }
          } finally {
            statsMngr?.subClosed();
          }

          if (!gotNewEvent) {
            // termination condition 2
            logger?.log("info", `got ${localSeenEventIds.size} events`);
            statsMngr?.setRelayStatus(rurl, isAboutToAbort ? "aborted" : "completed");
            resolveAllOnEarlyBreak();
            break;
          }
          if (options.abortSignal?.aborted) {
            // termination condition 3
            logger?.log("info", `aborted`);
            statsMngr?.setRelayStatus(rurl, isAboutToAbort ? "aborted" : "completed");
            resolveAllOnEarlyBreak();
            break;
          }

          nextUntil = oldestCreatedAt + 1;
          statsMngr?.setRelayFrontier(rurl, oldestCreatedAt);
        }
      }),
    );

    // the "merger".
    // for each key: merges result from relays, sorts events, takes latest events and sends it to the result channel.
    Promise.all(
      allKeys.map(async (key) => {
        const logger = this.#debugLogger?.subLogger(abbreviate(String(key), 6));

        // wait for all the buckets for the key to fulfilled
        const evsPerRelay = await Promise.all(latches.itemsByKey(key)?.map((d) => d.promise) ?? []);
        logger?.log("verbose", `fulfilled all buckets for this key`);

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

        // take latest events
        const res = (() => {
          // return latest `limit` events if not "reduced verification mode"
          if (options.skipVerification || !options.reduceVerification) {
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

        // send result
        if (options.withSeenOn) {
          // append "seen on" data to events if `withSeenOn` is true.
          tx.send({
            key,
            events: res.map((e) => {
              return { ...e, seenOn: globalSeenEvents.getSeenOn(e.id) };
            }) as NostrEventExt<SeenOn>[],
          });
        } else {
          tx.send({ key, events: res as NostrEventExt<SeenOn>[] });
        }
        statsMngr?.addProgress(1);
      }),
    ).then(() => {
      // finished to fetch events for all keys
      tx.close();
      statsMngr?.stop();
    });

    yield* chIter;
  }

  /**
   * Fetches the last event **for each key specified by `keysAndRelays`**.
   *
   * `keysAndRelays` can be either of two types:
   *
   * - `{ keys: K[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `keys` to fetch events.
   * - `Map<K, string[]>`: Key must be key of the event and value must be relay set for that key. The fetcher will use separate relay set for each key to fetch events.
   *
   * Result is an async iterable of `{ key: <key of events>, event: <the latest event which have that key> }` pairs.
   *
   * `event` in result will be `undefined` if no event matching the filter exists in any relay.
   */
  public async *fetchLastEventPerKey<K extends FetchFilterKeyName, SeenOn extends boolean = false>(
    keyName: K,
    keysAndRelays: KeysAndRelays<K>,
    otherFilter: Omit<FetchFilter, K>,
    options: FetchLatestOptions<SeenOn> = {},
  ): AsyncIterable<NostrEventWithKey<K, SeenOn>> {
    const finalOpts = {
      ...defaultFetchLatestOptions,
      ...{
        // override default value of `abortSubBeforeEoseTimeoutMs` (10000 -> 1000)
        abortSubBeforeEoseTimeoutMs: 1000,
        ...options,
      },
    } as Required<FetchLatestOptions<SeenOn>>;

    const latest1Iter = this.fetchLatestEventsPerKey(
      keyName,
      keysAndRelays,
      otherFilter,
      1,
      finalOpts,
    );
    for await (const { key, events } of latest1Iter) {
      yield { key, event: events[0] };
    }
  }

  /**
   * Fetches latest up to `limit` events **for each author specified by `authorsAndRelays`**.
   *
   * `authorsAndRelays` can be either of two types:
   *
   * - `{ authors: string[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `authors` to fetch events.
   * - `Map<string, string[]>`: Key must be author's pubkey and value must be relay set for that author. The fetcher will use separate relay set for each author to fetch events.
   *
   * Result is an async iterable of `{ author: <author's pubkey>, events: <events from the author> }` pairs.
   *
   * Each array of events in the result are sorted in "newest to oldest" order.
   *
   * Throws {@linkcode NostrFetchError} if `limit` is a non-positive number.
   *
   * Note: it's just an wrapper of `fetchLatestEventsPerKey`.
   */
  public async *fetchLatestEventsPerAuthor<SeenOn extends boolean = false>(
    authorsAndRelays: AuthorsAndRelays,
    otherFilter: Omit<FetchFilter, "authors">,
    limit: number,
    options: FetchLatestOptions<SeenOn> = {},
  ): AsyncIterable<NostrEventListWithAuthor<SeenOn>> {
    for await (const { key, events } of this.fetchLatestEventsPerKey(
      "authors",
      adaptAuthorsAndRelays(authorsAndRelays),
      otherFilter,
      limit,
      options,
    )) {
      yield { author: key, events };
    }
  }

  /**
   * Fetches the last event **for each author specified by `authorsAndRelays`**.
   *
   * `authorsAndRelays` can be either of two types:
   *
   * - `{ authors: string[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `authors` to fetch events.
   * - `Map<string, string[]>`: Key must be author's pubkey and value must be relay set for that author. The fetcher will use separate relay set for each author to fetch events.
   *
   * Result is an async iterable of `{ author: <author's pubkey>, event: <the latest event from the author> }` pairs.
   *
   * `event` in result will be `undefined` if no event matching the filter for the author exists in any relay.
   *
   * Note: it's just a wrapper of `fetchLastEventPerKey`.
   */
  public async *fetchLastEventPerAuthor<SeenOn extends boolean = false>(
    authorsAndRelays: AuthorsAndRelays,
    otherFilter: Omit<FetchFilter, "authors">,
    options: FetchLatestOptions<SeenOn> = {},
  ): AsyncIterable<NostrEventWithAuthor<SeenOn>> {
    for await (const { key, event } of this.fetchLastEventPerKey(
      "authors",
      adaptAuthorsAndRelays(authorsAndRelays),
      otherFilter,
      options,
    )) {
      yield { author: key, event };
    }
  }

  /**
   * Cleans up all the internal states of the fetcher.
   */
  public shutdown() {
    this.#backend.shutdown();
  }
}
