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
 */
export type RelayStatus = "fetching" | "completed" | "aborted" | "failed";

/**
 * Per-relay fetch statistics.
 */
export type RelayFetchStats = {
  /** Status of relays during a fetch */
  status: RelayStatus;

  /** Number of events fetched from the relay */
  numFetchedEvents: number;

  /**
   * "Frontier" of the event fetching.
   * In other words, `created_at` of the oldest events fetched from the relay
   */
  frontier: number;
};

/**
 * Various statistics of the event fetching.
 */
export type FetchStats = {
  /** Overall progress of the event fetching */
  progress: {
    max: number;
    current: number;
  };
  /** Events and subscriptions counts */
  counts: {
    /** Number of events fetched from relays so far */
    fetchedEvents: number;
    /** Number of events buffered in the internal buffer */
    bufferedEvents: number;
    /** Number of subscriptions opened so far */
    openedSubs: number;
    /** Number of subscriptions that is running */
    runningSubs: number;
  };
  /** Per-relay fetch statistics */
  relays: {
    [relayUrl: string]: RelayFetchStats;
  };
};

/**
 * Type of functions for listening fetch statistics.
 */
export type FetchStatsListener = (stats: FetchStats) => void;
