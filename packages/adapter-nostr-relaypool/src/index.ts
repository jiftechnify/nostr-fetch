import { NRTPoolAdapter } from "./adapter";

import type {
  NostrFetcherBackendInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { RelayPool } from "nostr-relaypool";

/**
 * Wraps a nostr-relaypool's `RelayPool`, allowing it to interoperate with nostr-fetch.
 *
 * Note: if you use this adapter, `skipVerification` option is ignored.
 * You can still configure whether verify signatures or not on initializing `RelayPool`, but you can't configure about it "per fetch" basis.
 *
 * If your `RelayPool` is initialized with `skipVerification: false`, `reduceVerification` option becomes meaningless.
 *
 * Note: if you use this adapter, `skipFilterMatching` option is ignored and it always behaves as if `false` is specified (always check if events match with filters).
 *
 * @example
 * ```
 * import { RelayPool } from 'nostr-relaypool';
 * import { NostrFetcher } from 'nostr-fetch';
 * import { relayPoolAdapter } from '@nostr-fetch/adapter-nostr-relaypool'
 *
 * const pool = new RelayPool();
 * const fetcher = NostrFetcher.withCustomPool(relayPoolAdapter(pool));
 * ```
 */
export const relayPoolAdapter = (pool: RelayPool): NostrFetcherBackendInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new NRTPoolAdapter(pool, commonOpts);
  };
};
