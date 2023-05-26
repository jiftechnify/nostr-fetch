import { simplePoolAdapter } from "@nostr-fetch/adapter-nostr-tools";
import { eventKind, NostrFetcher } from "nostr-fetch";
import { SimplePool } from "nostr-tools";
import "websocket-polyfill";

import { defaultRelays, nHoursAgo } from "../utils";

const main = async () => {
  // initialize fetcher based on nostr-tools `SimplePool`
  const pool = new SimplePool();
  const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));

  // fetch all text events (kind: 1) posted in the last hour from the relays
  const eventsIter = await fetcher.allEventsIterator(
    defaultRelays,
    [
      {
        kinds: [eventKind.text],
      },
    ],
    {
      since: nHoursAgo(1),
    },
    {
      skipVerification: true,
    }
  );

  for await (const ev of eventsIter) {
    console.log(ev.content);
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
