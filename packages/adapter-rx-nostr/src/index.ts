import { RxNostrAdapter } from "./adapter";

import type {
  NostrFetcherBackendInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import type { RxNostr } from "rx-nostr";

/**
 * Wraps an RxNostr instance, allowing it to interoperate with nostr-fetch.
 */
export const rxNostrAdapter = (rxNostr: RxNostr): NostrFetcherBackendInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new RxNostrAdapter(rxNostr, commonOpts);
  };
};
