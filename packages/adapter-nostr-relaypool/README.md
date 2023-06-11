# @nostr-fetch/adapter-nostr-relaypool

This package includes the adapter for [nostr-relaypool's `RelayPool`](https://github.com/adamritter/nostr-relaypool-ts) which allows it to work with [**nostr-fetch**](https://github.com/jiftechnify/nostr-fetch), a utility library for fetching past events from Nostr relays.

If you want to use nostr-fetch, [here](https://github.com/jiftechnify/nostr-fetch#readme) is a good start point!

## Example

```ts
import { RelayPool } from 'nostr-relaypool';
import { NostrFetcher } from 'nostr-fetch';
import { relayPoolAdapter } from '@nostr-fetch/adapter-nostr-relaypool'

const pool = new RelayPool();
const fetcher = NostrFetcher.withCustomPool(relayPoolAdapter(pool));
```
