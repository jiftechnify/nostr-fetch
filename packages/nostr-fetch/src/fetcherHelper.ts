import { DebugLogger } from "@nostr-fetch/kernel/debugLogger";
import { NostrFetcherCommonOptions } from "@nostr-fetch/kernel/fetcherBase";
import { NostrEvent, querySupportedNips } from "@nostr-fetch/kernel/nostr";

/**
 * Type of errors that can be thrown from methods of `NostrFetcher`.
 */
export class NostrFetchError extends Error {
  static {
    this.prototype.name = "NostrFetchError";
  }
}

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
  logger: DebugLogger | undefined
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
  msg: string
): (req: T) => AssertionResult {
  return (req: T) => (predicate(req) ? { severity: "none" } : { severity, msg });
}

export function checkIfNonEmpty<T, U>(
  getArray: (req: T) => U[],
  severity: "error" | "warn",
  msg: string
): (req: T) => AssertionResult {
  return (req: T) => (getArray(req).length !== 0 ? { severity: "none" } : { severity, msg });
}

export function checkIfTimeRangeIsValid<T>(
  getTimeRange: (req: T) => { since?: number; until?: number },
  severity: "error" | "warn",
  msg: string
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
 * Map from all combinations of keys per relay URL in `keysPerRelay` to a value of type `V`.
 *
 * This has additional mapping from `key` in `keys` to array of values.
 */
export class KeyRelayMatrix<K extends string | number, V> {
  #matrix: Map<string, V>;
  #byKey: Map<K, V[]>;

  constructor(relayToKeys: Map<string, K[]>, initVal: () => V) {
    this.#matrix = new Map();

    const allKeys = [...new Set([...relayToKeys.values()].flat())]; // relayToKeys.values(): K[][]
    this.#byKey = new Map(allKeys.map((k) => [k, []]));

    for (const [r, keys] of relayToKeys) {
      for (const k of keys) {
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
  opts: Required<NostrFetcherCommonOptions>
) => RelayCapabilityChecker;

export const initDefaultRelayCapChecker = (opts: Required<NostrFetcherCommonOptions>) =>
  new DefaultRelayCapChecker(opts);
