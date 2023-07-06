/**
 * Type of errors that can be thrown from methods of `NostrFetcher`.
 */
export class NostrFetchError extends Error {
  static {
    this.prototype.name = "NostrFetchError";
  }
}

/* stats */

export type RelayStatus = "fetching" | "completed" | "aborted" | "failed";

export type RelayFetchStats = {
  status: RelayStatus;
  numFetchedEvents: number;
  frontier: number;
};

export type FetchStats = {
  progress: {
    max: number;
    current: number;
  };
  counts: {
    fetchedEvents: number;
    bufferedEvents: number;
    openedSubs: number;
    runningSubs: number;
  };
  relays: {
    [relayUrl: string]: RelayFetchStats;
  };
};

export type FetchStatsListener = (stats: FetchStats) => void;
