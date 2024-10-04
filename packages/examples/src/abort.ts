import { NostrFetcher } from "nostr-fetch";
import WebSocket from "ws";

import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init({ webSocketConstructor: WebSocket });

  // fetch all text events (kind: 1) posted in the last hour from the relays
  const evIter = fetcher.allEventsIterator(
    defaultRelays,
    {
      kinds: [1],
    },
    {
      since: nHoursAgo(24),
    },
    { signal: AbortSignal.timeout(1000) }, // pass an `AbortSignal` to enable cancallation
  );

  for await (const ev of evIter) {
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
