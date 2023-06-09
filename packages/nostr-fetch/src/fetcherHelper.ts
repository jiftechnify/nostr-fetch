import { NostrEvent } from "@nostr-fetch/kernel/nostr";

/**
 * Type of errors that can be thrown from methods of `NostrFetcher`.
 */
export class NostrFetchError extends Error {
  static {
    this.prototype.name = "NostrFetchError";
  }
}

/**
 * Validates `req` by `validators`.
 *
 * If there are something wrong, throws error that includes all error messages from validators.
 */
export const validateReq = <T>(req: T, validators: ((req: T) => string | undefined)[]): void => {
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

export function checkIfNonEmpty<T, U>(
  getArray: (req: T) => U[],
  msg: string
): (req: T) => string | undefined {
  return (req: T): string | undefined => (getArray(req).length === 0 ? msg : undefined);
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
 * Map from all combinations of `keys` and  `relayUrls` to a value of type `V`.
 *
 * This has additional mapping from `key` in `keys` to array of values.
 */
export class KeyRelayMatrix<K extends string | number, V> {
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
