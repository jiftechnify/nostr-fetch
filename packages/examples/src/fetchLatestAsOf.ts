import { eventKind, NostrFetcher } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init();

  // fetch the latest 100 text events (kind: 1) from the relays **as of** 2023-08-31 12:00:00 (UTC)
  const latestPosts = await fetcher.fetchLatestEvents(
    defaultRelays,
    {
      kinds: [eventKind.text],
    },
    100,
    { asOf: Math.floor(new Date("2023-08-31T12:00:00Z").getTime() / 1000) },
  );

  console.log(`got ${latestPosts.length} events`);
  for (const e of latestPosts) {
    console.log(`${e.content} (${new Date(e.created_at * 1000).toISOString()})`);
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
