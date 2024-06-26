import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import type { NostrFetcherCommonOptions } from "@nostr-fetch/kernel/fetcherBackend";
import { type NostrEvent, querySupportedNips } from "@nostr-fetch/kernel/nostr";
import { normalizeRelayUrlSet } from ".";
import {
  type FetchFilterKeyElem,
  type FetchFilterKeyName,
  type FetchStats,
  type FetchStatsListener,
  NostrFetchError,
  type RelayFetchStats,
  type RelayStatus,
} from "./types";

type AssertionResult =
  | {
      severity: "error" | "warn";
      msg: string;
    }
  | {
      severity: "none";
    };

/**
 * assert `req` by `assertions`.
 *
 * If there are some errors, throws `NostrFetchError` which includes all error messages raised from assertions.
 * If there are some warnings, just log them.
 */
export const assertReq = <T>(
  req: T,
  assertions: ((req: T) => AssertionResult)[],
  logger: DebugLogger | undefined,
): void => {
  const errors = [];
  for (const assert of assertions) {
    const res = assert(req);

    switch (res.severity) {
      case "error":
        logger?.log("error", `assertion error: ${res.msg}`);
        errors.push(res.msg);
        break;
      case "warn":
        logger?.log("warn", `warning: ${res.msg}`);
        break;
    }
  }
  if (errors.length > 0) {
    const lines = errors.map((e) => `- ${e}`).join("\n");
    throw new NostrFetchError(`Invalid request!\n${lines}`);
  }
};

export function checkIfTrue<T>(
  predicate: (req: T) => boolean,
  severity: "error" | "warn",
  msg: string,
): (req: T) => AssertionResult {
  return (req: T) => (predicate(req) ? { severity: "none" } : { severity, msg });
}

export function checkIfNonEmpty<T, U>(
  getArray: (req: T) => U[],
  severity: "error" | "warn",
  msg: string,
): (req: T) => AssertionResult {
  return (req: T) => (getArray(req).length !== 0 ? { severity: "none" } : { severity, msg });
}

export function checkIfTimeRangeIsValid<T>(
  getTimeRange: (req: T) => { since?: number; until?: number },
  severity: "error" | "warn",
  msg: string,
): (req: T) => AssertionResult {
  return (req: T) => {
    const { since, until } = getTimeRange(req);

    if (since === undefined || until === undefined) {
      // time range is always valid if at least one of the bounds is unbounded.
      return { severity: "none" };
    }
    return since <= until ? { severity: "none" } : { severity, msg };
  };
}

/**
 * comparator represents descending order by `created_at` of events (a.k.a. "newest to oldest" order)
 */
export const createdAtDesc = (a: NostrEvent, b: NostrEvent): number => b.created_at - a.created_at;

/**
 * get keys corresponds to `keyName` from the event.
 */
export const getKeysOfEvent = <K extends FetchFilterKeyName>(
  keyName: K,
  ev: NostrEvent,
): FetchFilterKeyElem<K>[] => {
  switch (keyName) {
    case "ids":
      return [ev.id];
    case "authors":
      return [ev.pubkey];
    case "kinds":
      return [ev.kind];
  }
  // tag key -> values of tags with the target name
  const tagVals = ev.tags.filter((t) => t[0] === keyName.charAt(1)).map((t) => t[1] ?? "");
  return [...new Set(tagVals)];
};

// type of a result of EventBuckets#add
type EventBucketAddResult =
  | { state: "open" }
  | { state: "fulfilled"; events: NostrEvent[] }
  | { state: "dropped" };

/**
 * Set of event buckets for each `key`, with limit on the number of events.
 */
export class EventBuckets<K> {
  #buckets: Map<K, NostrEvent[]>;
  #limitPerKey: number;

  // pre-condition: `keys` should be deduped in advance.
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
      { keys: [] as K[], limit: 0 },
    );
  }
}

/**
 * Map from all combinations of keys per relay URL in `keysPerRelay` to a value of type `V`.
 *
 * This has additional mapping from `key` in `keys` to array of values.
 */
export class KeyRelayMatrix<K extends string | number, V> {
  #matrix: Map<string, V>;
  #byKey: Map<K, V[]>;

  // pre-condition: each array of `relayToKeys.values()` should be deduped in advance.
  constructor(relayToKeys: Map<string, K[]>, initVal: () => V) {
    this.#matrix = new Map();

    const allKeys = [...new Set([...relayToKeys.values()].flat())]; // relayToKeys.values(): K[][]
    this.#byKey = new Map(allKeys.map((k) => [k, []]));

    for (const [r, keys] of relayToKeys) {
      for (const k of keys) {
        const v = initVal();

        this.#matrix.set(this.#getKey(k, r), v);
        this.#byKey.get(k)?.push(v);
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

export interface RelayCapabilityChecker {
  relaySupportsNips(relayUrl: string, requiredNips: number[]): Promise<boolean>;
}

class DefaultRelayCapChecker implements RelayCapabilityChecker {
  #supportedNipsCache: Map<string, Set<number>> = new Map();
  #debugLogger: DebugLogger | undefined;

  constructor(opts: Required<NostrFetcherCommonOptions>) {
    if (opts.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(opts.minLogLevel);
    }
  }

  async relaySupportsNips(relayUrl: string, requiredNips: number[]): Promise<boolean> {
    const logger = this.#debugLogger?.subLogger(relayUrl);

    if (requiredNips.length === 0) {
      return true;
    }

    const supportSetFromCache = this.#supportedNipsCache.get(relayUrl);
    if (supportSetFromCache !== undefined) {
      return requiredNips.every((nip) => supportSetFromCache.has(nip));
    }

    // query supported NIP's of the relay if cache doesn't have information
    const supportSet = await querySupportedNips(relayUrl);
    logger?.log("info", `supported NIPs: ${supportSet}`);

    this.#supportedNipsCache.set(relayUrl, supportSet);
    return requiredNips.every((nip) => supportSet.has(nip));
  }
}

export type RelayCapCheckerInitializer = (
  opts: Required<NostrFetcherCommonOptions>,
) => RelayCapabilityChecker;

export const initDefaultRelayCapChecker = (opts: Required<NostrFetcherCommonOptions>) =>
  new DefaultRelayCapChecker(opts);

type SeenEventsReportResult<SeenOn extends boolean> = {
  hasSeen: boolean;
  seenOn: SeenOn extends true ? string[] : undefined;
};

export interface SeenEvents<SeenOn extends boolean> {
  report(event: NostrEvent, relayUrl: string): SeenEventsReportResult<SeenOn>;
  getSeenOn(eventId: string): string[];
}

export const initSeenEvents = <SeenOn extends boolean>(withSeenOn: SeenOn): SeenEvents<SeenOn> =>
  withSeenOn
    ? (new SeenOnTable() as SeenEvents<SeenOn>)
    : (new SeenEventsSet() as SeenEvents<SeenOn>);

class SeenOnTable implements SeenEvents<true> {
  #table = new Map<string, Set<string>>();

  report(event: NostrEvent, relayUrl: string): SeenEventsReportResult<true> {
    const seenOn = this.#table.get(event.id);
    if (seenOn !== undefined) {
      const updated = seenOn.add(relayUrl);
      return { hasSeen: true, seenOn: [...updated] };
    }
    this.#table.set(event.id, new Set([relayUrl]));
    return { hasSeen: false, seenOn: [relayUrl] };
  }

  getSeenOn(eventId: string): string[] {
    return [...(this.#table.get(eventId) ?? [])];
  }
}

class SeenEventsSet implements SeenEvents<false> {
  #seenIds = new Set<string>();

  report(event: NostrEvent, _: string): SeenEventsReportResult<false> {
    if (this.#seenIds.has(event.id)) {
      return { hasSeen: true, seenOn: undefined };
    }
    this.#seenIds.add(event.id);
    return { hasSeen: false, seenOn: undefined };
  }

  getSeenOn(_: string): string[] {
    return [];
  }
}

export class FetchStatsManager {
  #stats: Omit<FetchStats, "relays" | "elapsedTimeMs"> = {
    progress: {
      max: 1, // prevent division by 0
      current: 0,
    },
    counts: {
      fetchedEvents: 0,
      bufferedEvents: 0,
      openedSubs: 0,
      runningSubs: 0,
    },
  };
  #startedAt: number = performance.now();
  #relayStatsMap: Map<string, RelayFetchStats> = new Map();
  #cb: FetchStatsListener;
  #timer: NodeJS.Timeout | undefined;

  private constructor(cb: FetchStatsListener, notifInterval: number) {
    this.#cb = cb;
    this.#timer = setInterval(() => {
      this.#cb(this.#renderStats());
    }, notifInterval);
  }

  #renderStats(): FetchStats {
    return {
      ...this.#stats,
      elapsedTimeMs: performance.now() - this.#startedAt,
      relays: Object.fromEntries(this.#relayStatsMap),
    };
  }

  static init(
    cb: FetchStatsListener | undefined,
    notifIntervalMs: number,
  ): FetchStatsManager | undefined {
    return cb !== undefined ? new FetchStatsManager(cb, notifIntervalMs) : undefined;
  }

  /* progress */
  setProgressMax(max: number): void {
    this.#stats.progress.max = Math.max(max, 1);
  }

  addProgress(delta: number): void {
    this.#stats.progress.current += delta;
  }

  setCurrentProgress(p: number): void {
    this.#stats.progress.current = p;
  }

  /* counts */
  eventFetched(rurl: string): void {
    this.#stats.counts.fetchedEvents++;

    // update event count of relay
    const rs = this.#relayStatsMap.get(rurl);
    if (rs !== undefined) {
      rs.numFetchedEvents++;
    }
  }

  setNumBufferedEvents(n: number): void {
    this.#stats.counts.bufferedEvents = n;
  }

  subOpened(): void {
    this.#stats.counts.openedSubs++;
    this.#stats.counts.runningSubs++;
  }

  subClosed(): void {
    this.#stats.counts.runningSubs--;
  }

  /* relay stats */
  initRelayStats(allReleys: string[], connectedRelays: string[], initUntil: number): void {
    const connectedSet = new Set(connectedRelays);
    const failedRelays = normalizeRelayUrlSet(allReleys).filter((r) => !connectedSet.has(r));

    console.log(allReleys, connectedRelays, failedRelays);

    const connectedEntries: [string, RelayFetchStats][] = connectedRelays.map((rurl) => [
      rurl,
      {
        status: "fetching",
        numFetchedEvents: 0,
        frontier: initUntil,
      },
    ]);
    const failedEntries: [string, RelayFetchStats][] = failedRelays.map((rurl) => [
      rurl,
      {
        status: "connection-failed",
        numFetchedEvents: 0,
        frontier: 0,
      },
    ]);

    this.#relayStatsMap = new Map([...connectedEntries, ...failedEntries]);
  }

  setRelayStatus(rurl: string, status: RelayStatus): void {
    const rs = this.#relayStatsMap.get(rurl);
    if (rs !== undefined) {
      rs.status = status;
    }
  }

  setRelayFrontier(rurl: string, frontier: number): void {
    const rs = this.#relayStatsMap.get(rurl);
    if (rs !== undefined) {
      rs.frontier = frontier;
    }
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
    }
    // notify last stats before stopped
    this.#cb(this.#renderStats());
  }
}

// tracks per-relay fetch progress
export class ProgressTracker {
  #progressPerRelay: Map<string, number>;

  constructor(relayUrls: string[]) {
    this.#progressPerRelay = new Map(relayUrls.map((rurl) => [rurl, 0]));
  }

  addProgress(relayUrl: string, delta: number) {
    const prev = this.#progressPerRelay.get(relayUrl) ?? 0;
    this.#progressPerRelay.set(relayUrl, prev + delta);
  }

  setProgress(relayUrl: string, prog: number) {
    this.#progressPerRelay.set(relayUrl, prog);
  }

  calcTotalProgress(): number {
    return [...this.#progressPerRelay.values()].reduce((total, prog) => total + prog);
  }
}
