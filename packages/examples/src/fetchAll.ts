import { NostrFetcher } from "nostr-fetch";
import WebSocket from "ws";

import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init({ webSocketConstructor: WebSocket });

  // fetch all text events (kind: 1) posted in last hour from the relays
  const events = await fetcher.fetchAllEvents(
    defaultRelays,
    {
      kinds: [1],
    },
    {
      since: nHoursAgo(1),
    },
    { sort: true },
  );

  console.log(`fetched ${events.length} events`);
  for (const ev of events) {
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
