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

## Examples
You can find example codes under `packages/examples` directory.

To run examples, follow the steps (using `npm` for example):

```bash
# first time only: install dependencies & build subpackages
npm install && npm run build


# then, execute example
# the command executes packages/examples/src/fetchAll.ts
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

#### `NostrFetcher.withRelayPool()`

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
