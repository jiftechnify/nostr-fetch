import { NDKAdapter } from "./adapter";

import type NDK from "@nostr-dev-kit/ndk";
import type {
  NostrFetcherBackendInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";

/**
 * Wraps an NDK instance, allowing it to interoperate with nostr-fetch.
 *
 * Note: if you use this adapter, `skipVerification` option is ignored and it always behaves as if `false` is specified (always verify signatures).
 * Moreover, `reduceVerification` option becomes meaningless with this adapter.
 *
 * Note: if you use this adapter, `skipFilterMatching` option is ignored and it always behaves as if `false` is specified (always check if events match with filters).
 *
 * @example
 * ```
 * import NDK from '@nostr-dev-kit/ndk';
 * import { NostrFetcher, normalizeRelayUrlSet } from 'nostr-fetch';
 * import { ndkAdapter } from '@nostr-fetch/adapter-ndk';
 *
 * // You should normalize a set of relay URLs by `normalizeRelayUrlSet` before passing them to NDK's constructor if working with nostr-fetch!
 * const explicitRelays = normalizeRelayUrlSet([
 *   "wss://relay-jp.nostr.wirednet.jp",
 *   "wss://relay.damus.io",
 * ]);
 *
 * const main = async () => {
 *   const ndk = new NDK({ explicitRelayUrls: explicitRelays });
 *   await ndk.connect(); // ensure connections to the "explicit relays" before fetching events!
 *
 *   const fetcher = NostrFetcher.withCustomPool(ndkAdapter(ndk));
 *   // ...
 * }
 * ```
 */
export const ndkAdapter = (ndk: NDK): NostrFetcherBackendInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new NDKAdapter(ndk, commonOpts);
  };
};
