# @nostr-fetch/adapter-rx-nostr

This package includes the adapter for [rx-nostr](https://github.com/penpenpng/rx-nostr) which allows it to work with [**nostr-fetch**](https://github.com/jiftechnify/nostr-fetch), a utility library for fetching past events from Nostr relays.

If you want to use nostr-fetch, [here](https://github.com/jiftechnify/nostr-fetch#readme) is a good start point!

## Example

```ts
import { createRxNostr } from 'rx-nostr';
import { NostrFetcher } from 'nostr-fetch';
import { rxNostrAdapter } from '@nostr-fetch/adapter-rx-nostr';

const main = async () => {
    const rxNostr = createRxNostr();
    const fetcher = NostrFetcher.withCustomPool(rxNostrAdapter(rxNostr));
    // ...
}
```

## Minimum Supported Version of rx-nostr

| adapter version | rx-nostr version |
|-----------------|------------------|
| < 0.13.0        | 1.1.0            |
| >= 0.13.0       | 1.2.0            |
