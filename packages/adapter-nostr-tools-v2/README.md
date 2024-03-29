# @nostr-fetch/adapter-nostr-tools-v2

This package includes the adapter for [`SimplePool` of nostr-tools v2](https://github.com/nbd-wtf/nostr-tools) (>= 2.1.0) which allows it to work with [**nostr-fetch**](https://github.com/jiftechnify/nostr-fetch), a utility library for fetching past events from Nostr relays.

If you want to use nostr-fetch, [here](https://github.com/jiftechnify/nostr-fetch#readme) is a good start point!

## Example

```ts
import { SimplePool } from 'nostr-tools';
import { NostrFetcher } from 'nostr-fetch';
import { simplePoolAdapter } from '@nostr-fetch/adapter-nostr-tools'

const pool = new SimplePool();
const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
```

## Minimum Supported Version of nostr-tools

| adapter version | nostr-tools version |
|-----------------|---------------------|
| *               | 2.1.0               |
