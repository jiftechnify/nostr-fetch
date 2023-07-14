import { NostrFetcher, eventKind } from "nostr-fetch";
import "websocket-polyfill";

import { nHoursAgo } from "./utils";

const searchRelays = ["wss://relay.nostr.band", "wss://search.nos.today"];

if (process.argv.length <= 2) {
  console.error("usage: search <query>");
  process.exit(1);
}
const searchQuery = process.argv[2] as string;

const main = async () => {
  const fetcher = NostrFetcher.init();

  // fetch all the text events (kind: 1) which match the search query and have posted in the last 24 hours
  const eventsIter = fetcher.allEventsIterator(
    searchRelays,
    {
      kinds: [eventKind.text],
      search: searchQuery,
    },
    {
      since: nHoursAgo(24),
    },
    {
      skipVerification: true,
    },
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
