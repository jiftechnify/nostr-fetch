import { NostrFetcher } from "nostr-fetch";
import WebSocket from "ws";

import { defaultRelays } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init({ webSocketConstructor: WebSocket });

  // fetch the latest 100 text events (kind: 1) from the relays
  const latestPosts = await fetcher.fetchLatestEvents(
    defaultRelays,
    {
      kinds: [1],
    },
    100,
  );

  console.log(`got ${latestPosts.length} events`);
  for (const e of latestPosts) {
    console.log(e.content);
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
