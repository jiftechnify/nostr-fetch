# nostr-fetch
A utility library that allows JS/TS apps to effortlessly fetch *past* events from Nostr relays.

## Installation
```
# npm
npm install nostr-fetch

# yarn
yarn add nostr-fetch

# pnpm
pnpm add nostr-fetch
```

## Usage

### Basic

```ts
import { eventKind, NostrFetcher } from "nostr-fetch";

const nHoursAgo = (hrs: number): number =>
  Math.floor((Date.now() - hrs * 60 * 60 * 1000) / 1000);

const fetcher = NostrFetcher.init();
const relayUrls = [/* relay URLs */];

// fetches all text events since 24 hr ago in streaming manner
const postIter = await fetcher.allEventsIterator(
    relayUrls, 
    /* filters (kinds, authors, ids, tags) */
    [
        { kinds: [ eventKind.text ] }
    ],
    /* time range filter (since, until) */
    // it is merged into each filter in the array of normal filters above.
    { since: nHoursAgo(24) },
    /* fetch options (optional) */
    { skipVerification: true }
);
for await (const ev of postIter) {
    console.log(ev.content);
}

// fetches all text events since 24 hr ago, as a single array
const allPosts = await fetcher.fetchAllEvents(
    relayUrls,
    /* filters */
    [
        { kinds: [ eventKind.text ] }
    ],
    /* time range filter */
    { since: nHoursAgo(24) },
    /* fetch options (optional) */
    { sort: true }
)

// fetches latest 100 text events
// internally: 
// 1. fetch latest 100 events from each relay
// 2. merge lists of events
// 3. take latest 100 events
const latestPosts = await fetcher.fetchLatestEvents(
    relayUrls,
    /* filters */
    [
        { kinds: [ eventKind.text ] }
    ],
    /* number of events to fetch */
    100,
);

// fetches the last metadata event published by pubkey "deadbeef..."
// internally:
// 1. fetch the last event from each relay
// 2. take the latest one
const lastMetadata = await fetcher.fetchLastEvent(
    relayUrls,
    /* filters */
    [
        { kinds: [ eventKind.metadata ], authors: [ "deadbeef..." ] }
    ],
)
```
### Working with [nostr-tools](https://github.com/nbd-wtf/nostr-tools)

First, install the adapter package.

```bash
npm install @nostr-fetch/adapter-nostr-tools
```

```ts
import { eventKind, NostrFetcher } from "nostr-fetch";
import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { SimplePool } from "nostr-tools";

const pool = new SimplePool();

// wrap SimplePool with simplePoolAdapter to make it interoperable with nostr-fetch
const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));

// now, you can use any fetch methods described above!
```

### Aborting

```ts
import { eventKind, NostrFecher } from 'nostr-fetch'

const fetcher = NostrFetcher.init();
const relayUrls = [/* relay URLs */];

const abortCtrl = new AbortController();

const evIter = await fetcher.allEventsIterator(
    relayUrls,
    [/* filters */],
    {/* time range */},
    /* pass `AbortController.signal` here to enable abortion! */
    { abortSignal: abortCtrl.signal } 
);

// abort after 1 sec
setTimeout(() => abortCtrl.abort(), 1000);

for await (const ev of evIter) {
    // ...
}
```

## Examples
You can find example codes under `packages/@nostr-fetch/examples` directory.

To run examples, follow the steps (using `npm` for example):

```bash
# first time only: install dependencies & build subpackages
npm install && npm run build


# then, execute example
# the command executes packages/@nostr-fetch/examples/src/fetchAll.ts
npm run example fetchAll

# "getProfiles" takes a hex pubkey as an argument
npm run example getProfiles <your hex pubkey>
```

## API
### class `NostrFetcher`

The entry point of Nostr events fetching. 

It manages connections to Nostr relays under the hood. It is recommended to reuse single `NostrFetcher` instance in entire app.

You should instantiate it with following initializers instead of the constructor.

#### `NostrFetcher.init()`

Initializes a `NostrFetcher` instance based on the default relay pool implementation.

#### `NostrFetcher.withCustomPool()`

Initializes a `NostrFetcher` instance based on a custom relay pool implementation passed as an argument.

This opens up interoperability with other relay pool implementations such as [nostr-tools](https://github.com/nbd-wtf/nostr-tools)' `SimplePool`.

---

### `NostrFetcher#allEventsIterator()`

```ts
public async allEventsIterator(
    relayUrls: string[],
    filters: FetchFilter[],
    timeRangeFilter: FetchTimeRangeFilter,
    options: FetchOptions = {}
): Promise<AsyncIterable<NostrEvent>>
```

Returns an async iterable of all events matching the filters from Nostr relays specified by the array of URLs.

You can iterate over events using for-await-of loop.

```ts
const fetcher = NostrFetcher.init();
const events = await fetcher.allEventsIterator([...], [{...}], {...});
for await (const ev of events) {
    // process events
}
```

> **Note**
>
> There are no guarantees about the order of returned events. Especially, events are not necessarily ordered in "newest to oldest" order.

---

### `NostrFetcher#fetchAllEvents()`

```ts
public async fetchAllEvents(
    relayUrls: string[],
    filters: FetchFilter[],
    timeRangeFilter: FetchTimeRangeFilter,
    options: FetchAllOptions = {}
): Promise<NostrEvent[]>
```

Fetches all events matching the filters from Nostr relays specified by the array of URLs, and collect them into an array.

If `sort: true` is specified in `options`, events in the resulting array will be sorted in "newest to oldest" order.

> **Note**
>
> There are no guarantees about the order of returned events if `sort` options is not specified.

---

### `NostrFetcher#fetchLatestEvents()`

```ts
public async fetchLatestEvents(
    relayUrls: string[],
    filters: FetchFilter[],
    limit: number,
    options: FetchLatestOptions = {}
): Promise<NostrEvent[]>
```

Fetches latest up to `limit` events matching the filters from Nostr relays specified by the array of URLs. 

Events in the result will be sorted in "newest to oldest" order.

---

### `NostrFetcher#fetchLastEvent()`

```ts
public async fetchLastEvent(
    relayUrls: string[],
    filters: FetchFilter[],
    options: FetchLatestOptions = {}
): Promise<NostrEvent | undefined>
```

Fetches the last event matching the filters from Nostr relays specified by the array of URLs.

Returns `undefined` if no event matching the filters exists in any relay.

---

### `NostrFetcher#shutdown()`

```ts
public shutdown(): void
```

Closes all the connections to relays and clean up the internal relay pool.
