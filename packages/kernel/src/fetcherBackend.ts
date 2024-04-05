import type { LogLevel } from "./debugLogger";
import type { Filter, NostrEvent } from "./nostr";

export type EnsureRelaysOptions = {
  connectTimeoutMs: number;
};

export type FetchTillEoseOptions = {
  subId?: string;
  eventVerifier: (event: NostrEvent) => boolean;
  skipVerification: boolean;
  skipFilterMatching: boolean;
  connectTimeoutMs: number;
  abortSubBeforeEoseTimeoutMs: number;
  abortSignal: AbortSignal | undefined;
};

/**
 * Set of APIs to fetch past events from nostr relays.
 *
 * `NostrFetcher` implements its functions on top of this.
 */
export interface NostrFetcherBackend {
  /**
   * Ensures connections to the relays prior to an event subscription.
   *
   * Returns URLs of relays *successfully connected to*.
   *
   * It should *normalize* the passed `relayUrls` before establishing connections to relays.
   *
   * Hint:
   * You should make use of the function `normalizeRelayUrlSet` from `@nostr-fetch/kernel/utils` to normalize a set of relay URLs.
   *
   */
  ensureRelays(relayUrls: string[], options: EnsureRelaysOptions): Promise<string[]>;

  /**
   * Fetches Nostr events matching `filters` from the relay specified by `relayUrl` until EOSE.
   *
   * The result is an `AsyncIterable` of Nostr events.
   * You can think that it's an asynchronous channel which conveys events.
   * The channel will be closed once EOSE is reached.
   *
   * If one of the following situations occurs, it is regarded as "failure".
   * In such a case, it should throw `FetchTillEoseFailedSignal`.
   *
   * - It couldn't establish connection to the relay
   * - Received a NOTICE message during the fetch
   * - A WebSocket error occurred during the fetch
   *
   *
   * If the fetch was aborted (due to AbortController or auto abortion timer), it should throw `FetchTillEoseAbortedSignal`.
   *
   * Hint:
   * You can make use of a `Channel` to convert "push" style code (bunch of event listers) to `AsyncIterable`.
   */
  fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions,
  ): AsyncIterable<NostrEvent>;

  /**
   * Cleans up all the internal states of the fetcher.
   */
  shutdown(): void;
}

/**
 * Error type signaling that `NostrFetcherBackend#fetchTillEose()` failed
 * (connection was not established / NOTICE received / WebSocket error occurred)
 */
export class FetchTillEoseFailedSignal extends Error {
  static {
    FetchTillEoseFailedSignal.prototype.name = "FetchTillEoseFailedSignal";
  }
}

/**
 * Error type signaling that `NostrFetcherBackend#fetchTillEose()` is aborted (due to AbortController or auto abortion)
 */
export class FetchTillEoseAbortedSignal extends Error {
  static {
    FetchTillEoseAbortedSignal.prototype.name = "FetchTillEoseAbortedSignal";
  }
}

/**
 * Check if `err` is {@linkcode FetchTillEoseFailedSignal}.
 *
 * Note that you can't check that using `instanceof` operator.
 */
export const isFetchTillEoseFailedSignal = (err: unknown): err is FetchTillEoseFailedSignal =>
  err instanceof Error && err.name === "FetchTillEoseFailedSignal";

/**
 * Check if `err` is {@linkcode FetchTillEoseAbortedSignal}.
 *
 * Note that you can't check that using `instanceof` operator.
 */
export const isFetchTillEoseAbortedSignal = (err: unknown): err is FetchTillEoseAbortedSignal =>
  err instanceof Error && err.name === "FetchTillEoseAbortedSignal";

/**
 * Common options for `NostrFetcher` and all `NostrFetcherBackend` implementations.
 */
export type NostrFetcherCommonOptions = {
  minLogLevel?: LogLevel;
};

/**
 * Default values of `NostrFetcherCommonOptions`.
 */
export const defaultFetcherCommonOptions: Required<NostrFetcherCommonOptions> = {
  minLogLevel: "warn",
};

/**
 * Type of initializer functions of `NostrFetcherBackend`s.  Takes `NostrFetcherCommonOptions` and initialize a `NostrFetcherBackend` impl.
 *
 * A "relay pool adapter" should return initializer function of this type.
 */
export type NostrFetcherBackendInitializer = (
  commonOpts: Required<NostrFetcherCommonOptions>,
) => NostrFetcherBackend;
