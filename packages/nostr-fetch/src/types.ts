export type FetchStats = {
  progress: {
    max: number;
    current: number;
  };
  count: {
    fetchedEvents: number;
    bufferedEvents: number;
    openedSubs: number;
    runningSubs: number;
  };
};

export type FetchStatsListener = (stats: FetchStats) => void;
