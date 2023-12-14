# @nostr-fetch/adapter-ndk

This package includes the adapter for [NDK(Nostr Dev Kit)](https://github.com/nostr-dev-kit/ndk) which allows it to work with [**nostr-fetch**](https://github.com/jiftechnify/nostr-fetch), a utility library for fetching past events from Nostr relays.

If you want to use nostr-fetch, [here](https://github.com/jiftechnify/nostr-fetch#readme) is a good start point!

## Example

```ts
import NDK from '@nostr-dev-kit/ndk';
import { NostrFetcher, normalizeRelayUrlSet } from 'nostr-fetch';
import { ndkAdapter } from '@nostr-fetch/adapter-ndk';

// You should normalize a set of relay URLs by `normalizeRelayUrlSet` before passing them to NDK's constructor if working with nostr-fetch!
const explicitRelays = normalizeRelayUrlSet([
    "wss://relay-jp.nostr.wirednet.jp",
    "wss://relay.damus.io",
]);

const main = async () => {
    const ndk = new NDK({ explicitRelayUrls: explicitRelays });
    await ndk.connect(); // ensure connections to the "explicit relays" before fetching events!

    const fetcher = NostrFetcher.withCustomPool(ndkAdapter(ndk));
    // ...
}
```

## Minimum Supported Version of NDK

| adapter version       | NDK version |
|-----------------------|-------------|
| < 0.13.0              | 0.7.5       |
| >= 0.13.0 && < 0.14.1 | 0.8.4       |
| >= 0.14.1             | 1.0.0       |
