import { NostrFetcher, eventKind } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  // initialize fetcher based on nostr-relaypool's `RelayPool`
  const fetcher = NostrFetcher.init({ minLogLevel: "info" });

  // fetch all text events (kind: 1) posted in the last hour from the relays
  const eventsIter = fetcher.allEventsIterator(
    defaultRelays,
    {
      kinds: [eventKind.text],
    },
    {
      since: nHoursAgo(1),
    },
    {
      statsListener: (stats) => console.error(stats),
      statsNotifIntervalMs: 500,
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
