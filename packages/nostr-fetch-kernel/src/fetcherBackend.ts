import { LogLevel } from "./debugLogger";
import type { Filter, NostrEvent } from "./nostr";

export type EnsureRelaysOptions = {
  connectTimeoutMs: number;
};

export type FetchTillEoseOptions = {
  subId?: string;
  skipVerification: boolean;
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
   * You should make use of the function `normalizeRelayUrls` from `@nostr-fetch/kernel/utils` to normalize relay URLs.
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
   * If no connection to the specified relay has been established at the time this function is called, it will return an empty channel.
   *
   * Hint:
   * You can make use of a `Channel` to convert "push" style code (bunch of event listers) to `AsyncIterable`.
   */
  fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent>;

  /**
   * Cleans up all the internal states of the fetcher.
   */
  shutdown(): void;
}

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
  commonOpts: Required<NostrFetcherCommonOptions>
) => NostrFetcherBackend;
