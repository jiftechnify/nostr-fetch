import { setTimeout as delay } from "node:timers/promises";
import { NostrFetcher, eventKind } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  // initialize fetcher based on nostr-relaypool's `RelayPool`
  const fetcher = NostrFetcher.init();

  // fetch all text events (kind: 1) posted in the last 3 hours from the relays
  const eventsIter = await fetcher.allEventsIterator(
    defaultRelays,
    {
      kinds: [eventKind.text],
    },
    {
      since: nHoursAgo(3),
    },
    {
      skipVerification: true,
      enableBackpressure: true, // enabling backpressure mode!
    }
  );

  for await (const ev of eventsIter) {
    console.log(ev.content);
    await delay(5); // simulating slow consumer
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
