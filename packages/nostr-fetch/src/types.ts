import { Filter } from "@nostr-fetch/kernel/nostr";

/**
 * Structure of Nostr event filter except `limit`, `since` and `until`.
 */
export type FetchFilter = Omit<Filter, "limit" | "since" | "until">;

export type FetchFilterKeyName = keyof Omit<FetchFilter, "search">;

export type FetchFilterKeyElem<K extends FetchFilterKeyName> = Exclude<
  FetchFilter[K],
  undefined
>[number];

/**
 * Pair of timestamps which specifies time range of events to fetch.
 */
export type FetchTimeRangeFilter = Pick<Filter, "since" | "until">;

/**
 * Type of errors that can be thrown from `NostrFetcher` methods.
 */
export class NostrFetchError extends Error {
  static {
    this.prototype.name = "NostrFetchError";
  }
}

/* stats */

/**
 * Status of relays during a fetch.
 *
 * Legend:
 *
 * - `fetching`: the fetcher is actively fetching events from the relay
 * - `completed`: the fetcher have fetched enough events from the relay
 * - `aborted`: Fetching from the relay is aborted
 * - `failed`: An error occurred during fetching from the relay
 * - `connection-failed`: An error occured during connecting to the relay
 */
export type RelayStatus = "fetching" | "completed" | "aborted" | "failed" | "connection-failed";

/**
 * Per-relay fetch statistics.
 */
export type RelayFetchStats = {
  /** Status of relays during a fetch. */
  status: RelayStatus;

  /** Number of events fetched from the relay. */
  numFetchedEvents: number;

  /**
   * "Frontier" of the event fetching.
   * In other words, `created_at` of the oldest events fetched from the relay.
   */
  frontier: number;
};

/**
 * Various statistics of the event fetching.
 */
export type FetchStats = {
  /** Elapsed time in millisecond */
  elapsedTimeMs: number;
  /** Overall progress of the event fetching. */
  progress: {
    max: number;
    current: number;
  };
  /** Events and subscriptions counts. */
  counts: {
    /** Number of events fetched from relays so far. */
    fetchedEvents: number;
    /** Number of events buffered in the internal buffer. */
    bufferedEvents: number;
    /** Number of subscriptions opened so far. */
    openedSubs: number;
    /** Number of subscriptions that is running. */
    runningSubs: number;
  };
  /** Per-relay fetch statistics. */
  relays: {
    [relayUrl: string]: RelayFetchStats;
  };
};

/**
 * Type of functions for listening fetch statistics.
 */
export type FetchStatsListener = (stats: FetchStats) => void;
