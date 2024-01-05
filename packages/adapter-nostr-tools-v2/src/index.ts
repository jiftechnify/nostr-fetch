import { SimplePoolAdapter } from "./adapter";

import type {
  NostrFetcherBackendInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { SimplePool } from "nostr-tools";

/**
 * Wraps a nostr-tools' `SimplePool`, allowing it to interoperate with nostr-fetch.
 *
 * Note: if you use this adapter, `skipFilterMatching` option is ignored and it always behaves as if `false` is specified (always check if events match with filters).
 *
 * @example
 * ```
 * import { SimplePool } from 'nostr-tools';
 * import { NostrFetcher } from 'nostr-fetch';
 * import { simplePoolAdapter } from '@nostr-fetch/adapter-nostr-tools'
 *
 * const pool = new SimplePool();
 * const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
 * ```
 */
export const simplePoolAdapter = (pool: SimplePool): NostrFetcherBackendInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new SimplePoolAdapter(pool, commonOpts);
  };
};
