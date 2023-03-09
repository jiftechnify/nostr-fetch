import "websocket-polyfill";
import { eventKind, NostrFetcher } from "../src/index";
import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  const fetcher = new NostrFetcher();

  // fetch all text events (kind: 1) posted in last 24 hours from the relays
  const events = await fetcher.fetchAllEvents(
    defaultRelays,
    [
      {
        kinds: [eventKind.text],
      },
    ],
    {
      since: nHoursAgo(24),
    },
    { sort: true }
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
