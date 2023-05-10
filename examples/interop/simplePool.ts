import { SimplePool } from "nostr-tools";
import "websocket-polyfill";

import { eventKind, NostrFetcher } from "../../src/index";
import { simplePoolAdapter } from "../../src/nostr-tools/adapter";
import { defaultRelays, nHoursAgo } from "../utils";

const main = async () => {
  // initialize fetcher based on nostr-tools `SimplePool`
  const pool = new SimplePool();
  const fetcher = NostrFetcher.withRelayPool(simplePoolAdapter(pool));

  // fetch all text events (kind: 1) posted in last 24 hours from the relays
  const eventsIter = await fetcher.allEventsIterator(
    defaultRelays,
    [
      {
        kinds: [eventKind.text],
      },
    ],
    {
      since: nHoursAgo(24),
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
