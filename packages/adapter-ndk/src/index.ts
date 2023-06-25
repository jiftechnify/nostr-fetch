import { NDKAdapter } from "./adapter";

import type NDK from "@nostr-dev-kit/ndk";
import type {
  NostrFetcherBaseInitializer,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBase";

/**
 * Wraps an NDK instance, allowing it to interoperate with nostr-fetch.
 *
 * Note: if you use this adapter, `skipVerification` option is ignored and it always behaves as if `false` is specified (always verify signatures).
 * Moreover, `reduceVerification` option becomes meaningless with this adapter.
 *
 * @example
 * ```
 * import NDK from '@nostr-dev-kit/ndk';
 * import { NostrFetcher, normalizeRelayUrls } from 'nostr-fetch';
 * import { ndkAdapter } from '@nostr-fetch/adapter-ndk';
 *
 * // You should normalize relay URLs by `normalizeRelayUrls` before passing them to NDK's constructor if working with nostr-fetch!
 * const explicitRelays = normalizeRelayUrls([
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
export const ndkAdapter = (ndk: NDK): NostrFetcherBaseInitializer => {
  return (commonOpts: Required<NostrFetcherCommonOptions>) => {
    return new NDKAdapter(ndk, commonOpts);
  };
};
