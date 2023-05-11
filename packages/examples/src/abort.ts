import { eventKind, NostrFetcher } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays, nHoursAgo } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init();
  const abortCtrl = new AbortController();

  // fetch all text events (kind: 1) posted in last 24 hours from the relays
  const evIter = await fetcher.allEventsIterator(
    defaultRelays,
    [
      {
        kinds: [eventKind.text],
      },
    ],
    {
      since: nHoursAgo(24),
    },
    { abortSignal: abortCtrl.signal } // pass `AbortController.signal` to enable abortion
  );

  // abort fetching after 1 sec.
  setTimeout(() => abortCtrl.abort(), 1000);

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
