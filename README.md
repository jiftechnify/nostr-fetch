# nostr-fetch
A utility library that allows JS/TS apps to effortlessly fetch *past* events from Nostr relays.

## Installation

```
npm install nostr-fetch

yarn add nostr-fetch

pnpm add nostr-fetch
```

### Using from Browsers without Bundlers
You can also use nostr-fetch in your HTML via `<script>` tags, thanks to [jsDelivr](https://www.jsdelivr.com/).

```html
<script type="module">
  import { NostrFetcher } from "https://cdn.jsdelivr.net/npm/nostr-fetch@0.14.1/+esm"
  // ...
</script>
```

### Note for Node.js Users
On Node.js, you must install and import `websocket-polyfill` to work nostr-fetch correctly.

```
npm install websocket-polyfill
```

```ts
import { ... } from "nostr-fetch";
import "websocket-polyfill";
```

## Usage

### Basics

```ts
import { eventKind, NostrFetcher } from "nostr-fetch";

const nHoursAgo = (hrs: number): number =>
  Math.floor((Date.now() - hrs * 60 * 60 * 1000) / 1000);

const fetcher = NostrFetcher.init();
const relayUrls = [/* relay URLs */];

// fetches all text events since 24 hr ago in streaming manner
const postIter = fetcher.allEventsIterator(
    relayUrls, 
    /* filter (kinds, authors, ids, tags) */
    { kinds: [ eventKind.text ] },
    /* time range filter (since, until) */
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
    /* filter */
    { kinds: [ eventKind.text ] },
    /* time range filter */
    { since: nHoursAgo(24) },
    /* fetch options (optional) */
    { sort: true }
)
```

### Various Fetch Methods

```ts
import { eventKind, NostrFetcher } from "nostr-fetch";

const fetcher = NostrFetcher.init();
const relayUrls = [/* relay URLs */];

// fetches latest 100 text posts
// internally: 
// 1. fetch latest 100 events from each relay
// 2. merge lists of events
// 3. take latest 100 events
const latestPosts: NostrEvent[] = await fetcher.fetchLatestEvents(
    relayUrls,
    /* filter */
    { kinds: [ eventKind.text ] },
    /* number of events to fetch */
    100,
);

// fetches the last metadata event published by pubkey "deadbeef..."
// internally:
// 1. fetch the last event from each relay
// 2. take the latest one
const lastMetadata: NostrEvent | undefined = await fetcher.fetchLastEvent(
    relayUrls,
    /* filter */
    { kinds: [ eventKind.metadata ], authors: [ "deadbeef..." ] },
);

// fetches latest 10 text posts from each author in `authors`
const postsPerAuthor = fetcher.fetchLatestEventsPerAuthor(
    /* authors and relay set */
    // you can also pass a `Map` which has mappings from authors (pubkey) to reley sets,
    // to specify a relay set for each author
    { 
        authors: ["deadbeef...", "abcdef01...", ...],
        relayUrls,
    },
    /* filter */
    { kinds: [ eventKind.text ] },
    /* number of events to fetch for each author */
    10,
);
for await (const { author, events } of postsPerAuthor) {
    console.log(`posts from ${author}:`);
    for (const ev of events) {
        console.log(ev.content);
    }
}

// fetches the last metadata event from each author in `authors`
const metadataPerAuthor = fetcher.fetchLastEventPerAuthor(
    /* authors and relay set */
    // you can also pass a `Map` which has mappings from authors (pubkey) to reley sets,
    // to specify a relay set for each author
    {
        authors: ["deadbeef...", "abcdef01...", ...],
        relayUrls,
    }
    /* filter */
    { kinds: [ eventKind.metadata ] },
);
for await (const { author, event } of metadataPerAuthor ) {
    console.log(`${author}: ${event?.content ?? "not found"}`);
}
```

### Working with custom relay pool implementations

First, install the adapter package for the relay pool implementation you want to use.
For example, if you want to use nostr-fetch with nostr-tools' `SimplePool` :

```bash
npm install @nostr-fetch/adapter-nostr-tools
```

Then, wrap your relay pool instance with the adapter and pass it to the initializer `NostrFetcher.withCustomPool()`.
```ts
import { eventKind, NostrFetcher } from "nostr-fetch";
import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { SimplePool } from "nostr-tools";

const pool = new SimplePool();

// wrap SimplePool with simplePoolAdapter to make it interoperable with nostr-fetch
const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));

// now, you can use any fetch methods described above!
```

#### Table of Available Adapters

| Package         | Relay Pool Impl. | Adapter Package                        | Adapter             |
|-----------------|------------------|----------------------------------------|---------------------|
| [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools)     | `SimplePool`     | `@nostr-fetch/adapter-nostr-tools`     | `simplePoolAdapter` |
| [`nostr-relaypool`](https://github.com/adamritter/nostr-relaypool-ts) | `RelayPool`      | `@nostr-fetch/adapter-nostr-relaypool` | `relayPoolAdapter`  |
| [`@nostr-dev-kit/ndk`](https://github.com/nostr-dev-kit/ndk) | `NDK` | `@nostr-fetch/adapter-ndk` | `ndkAdapter` |
| [`rx-nostr`](https://github.com/penpenpng/rx-nostr) | `RxNostr` | `@nostr-fetch/adapter-rx-nostr` | `rxNostrAdapter` |

### Cancelling by AbortController

```ts
import { eventKind, NostrFecher } from "nostr-fetch"

const fetcher = NostrFetcher.init();
const relayUrls = [/* relay URLs */];

const evIter = fetcher.allEventsIterator(
    relayUrls,
    {/* filter */},
    {/* time range */},
    /* pass an `AbortSsignal` here to enable abortion! */
    { abortSignal: AbortSignal.timeout(1000) },
);

for await (const ev of evIter) {
    // ...
}
```

## Examples
You can find example codes under `packages/examples` directory.

To run examples, follow the steps (using `npm` for example):

```bash
# first time only: install dependencies & build subpackages
npm install && npm run build


# then, execute example
# the command executes packages/examples/src/fetchAll.ts
npm run example fetchAll

# some exaples takes a hex pubkey as an argument
npm run example fetchLastPerAuthor <your hex pubkey>
```

## API

- [class `NostrFetcher`](#class-nostrfetcher)
- Initializers and Finilizers
    + [`NostrFetcher.init`](#nostrfetcherinit)
    + [`NostrFetcher.withCustomPool`](#nostrfetcherwithcustompool)
    + [`NostrFetcher#shutdown`](#nostrfetchershutdown)
- Fetch Methods
    + [`allEventsIterator`](#alleventsiterator)
    + [`fetchAllEvents`](#fetchallevents)
    + [`fetchLatestEvents`](#fetchlatestevents)
    + [`fetchLastEvent`](#fetchlastevent)
    + [`fetchLatestEventsPerKey`](#fetchlatesteventsperkey)
    + [`fetchLastEventPerKey`](#fetchlasteventperkey)
    + [`fetchLatestEventsPerAuthor`](#fetchlatesteventsperauthor)
    + [`fetchLastEventPerAuthor`](#fetchlasteventperauthor)


### class `NostrFetcher`

The entry point of Nostr events fetching. 

It manages connections to Nostr relays under the hood. It is recommended to reuse single `NostrFetcher` instance in entire app.

You should instantiate it with following initializers instead of the constructor.

---

### Initializers and Finalizers

#### `NostrFetcher.init`

Initializes a `NostrFetcher` instance based on the default relay pool implementation.

#### `NostrFetcher.withCustomPool`

Initializes a `NostrFetcher` instance based on a custom relay pool implementation passed as an argument.

This opens up interoperability with other relay pool implementations such as [nostr-tools](https://github.com/nbd-wtf/nostr-tools)' `SimplePool`.  See [here](#working-with-custom-relay-pool-implementations) for details.

#### `NostrFetcher#shutdown`

Cleans up the internal relay pool.

If you use a fetcher instance initialized via `NostrFetcher.init`, calling this method closes conenctions to all the connected relays.

---

### Fetch Methods

All methods are instance methods of `NostrFetcher`.

#### `allEventsIterator`

```ts
public allEventsIterator(
    relayUrls: string[],
    filter: FetchFilter,
    timeRangeFilter: FetchTimeRangeFilter,
    options?: AllEventsIterOptions
): AsyncIterable<NostrEvent>
```

Returns an async iterable of all events matching the filter from Nostr relays specified by the array of URLs.

You can iterate over events using for-await-of loop.

```ts
const fetcher = NostrFetcher.init();
const events = fetcher.allEventsIterator([/* relays */], {/* filter */}, {/* time range */});
for await (const ev of events) {
    // process events
}
```

Specifying `enableBackpressure: true` in `options` enables "backpressure mode", where the fetcher is backpressured by the consumer of the iterator.

> **Note**
>
> There are no guarantees about the order of returned events. Especially, events are not necessarily ordered in "newest to oldest" order.

---

#### `fetchAllEvents`

```ts
public async fetchAllEvents(
    relayUrls: string[],
    filter: FetchFilter,
    timeRangeFilter: FetchTimeRangeFilter,
    options?: FetchAllOptions
): Promise<NostrEvent[]>
```

Fetches all events matching the filter from Nostr relays specified by the array of URLs, and collect them into an array.

If `sort: true` is specified in `options`, events in the resulting array will be sorted in "newest to oldest" order.

> **Note**
>
> There are no guarantees about the order of returned events if `sort` options is not specified.

---

#### `fetchLatestEvents`

```ts
public async fetchLatestEvents(
    relayUrls: string[],
    filter: FetchFilter,
    limit: number,
    options?: FetchLatestOptions
): Promise<NostrEvent[]>
```

Fetches latest up to `limit` events matching the filter from Nostr relays specified by the array of URLs. 

Events in the result will be sorted in "newest to oldest" order.

---

#### `fetchLastEvent`

```ts
public async fetchLastEvent(
    relayUrls: string[],
    filter: FetchFilter,
    options?: FetchLatestOptions
): Promise<NostrEvent | undefined>
```

Fetches the last event matching the filter from Nostr relays specified by the array of URLs.

Returns `undefined` if no event matching the filter exists in any relay.

---

#### `fetchLatestEventsPerKey`

```ts
public fetchLatestEventsPerKey<KN extends FetchFilterKeyName>(
    keyName: KN,
    keysAndRelays: KeysAndRelays<KN>,
    otherFilter: Omit<FetchFilter, KN>,
    limit: number,
    options?: FetchLatestOptions
): AsyncIterable<NostrEventListWithKey<KN>>
```

Fetches latest up to `limit` events **for each key specified by `keyName` and `keysAndRelays`**.

`keysAndRelays` can be either of two types:

- `{ keys: K[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `keys` to fetch events.
- `Map<K, string[]>`: Key must be the key of event and value must be relay set for that key. The fetcher will use separate relay set for each key to fetch events.

> **Note**
>
> The type `K` is `number` if `keyName` is `"kinds"`. Otherwise, `K` is `string`.

Result is an async iterable of `{ key: <key of events>, events: <events which have that key> }` pairs.

Each array of events in the result are sorted in "newest to oldest" order.

---

#### `fetchLastEventPerKey`

```ts
public fetchLatestEventsPerKey<KN extends FetchFilterKeyName>(
    keyName: KN,
    keysAndRelays: KeysAndRelays<KN>,
    otherFilter: Omit<FetchFilter, KN>,
    options?: FetchLatestOptions
): AsyncIterable<NostrEventWithKey<KN>>
```

Fetches the last event **for each key specified by `keysAndRelays`**.

`keysAndRelays` can be either of two types:

- `{ keys: K[], relayUrls: string[] }`: The fetcher will use the same relay set (`relayUrls`) for all `keys` to fetch events.
- `Map<K, string[]>`: Key must be key of the event and value must be relay set for that key. The fetcher will use separate relay set for each key to fetch events.

> **Note**
>
> The type `K` is `number` if `keyName` is `"kinds"`. Otherwise, `K` is `string`.

Result is an async iterable of `{ key: <key of events>, event: <the latest event which have that key> }` pairs.

`event` in result will be `undefined` if no event matching the filter exists in any relay.

---

#### `fetchLatestEventsPerAuthor`

```ts
public fetchLatestEventsPerAuthor(
    authorsAndRelays: AuthorsAndRelays,
    otherFilter: Omit<FetchFilter, "authors">,
    limit: number,
    options: FetchLatestOptions = {}
): AsyncIterable<{ author: string; events: NostrEvent[] }>
```
Fetches latest up to `limit` events **for each author specified by `authorsAndRelays`**.

It is just a wrapper of `fetchLatestEventsPerKey` specialized to `"authors"` key.

---

#### `fetchLastEventPerAuthor`

```ts
public fetchLastEventPerAuthor(
    authorsAndRelays: AuthorsAndRelays,
    otherFilter: Omit<FetchFilter, "authors">,
    options: FetchLatestOptions = {}
): AsyncIterable<{ author: string; event: NostrEvent | undefined }>
```

Fetches the last event **for each author specified by `authorsAndRelays`**.

It is just a wrapper of `fetchLastEventPerKey` specialized to `"authors"` key.


## Support me!
You can support this project by:

- ⭐ Starring the repo
- ⚡️ Sending some sats to my lightning address: jiftechnify@eclair.c-stellar.net
- 🐝 Sending funds via [PkgZap](https://pkgzap.albylabs.com/)
