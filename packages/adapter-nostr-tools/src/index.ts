import { SimplePoolExt } from "./adapter";

import type {
  NostrFetcherBaseInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBase";
import type { SimplePool } from "nostr-tools";

/**
 * Wraps a nostr-tools' `SimplePool`, allowing it to interoperate with nostr-fetch.
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
export const simplePoolAdapter = (pool: SimplePool): NostrFetcherBaseInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new SimplePoolExt(pool, commonOpts);
  };
};
