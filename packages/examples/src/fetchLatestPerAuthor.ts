import { eventKind, NostrFetcher } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays } from "./utils";

if (process.argv.length <= 2) {
  console.error("usage: fetchLatestPerAuthor <hex pubkey>");
  process.exit(1);
}
const pubkey = process.argv[2] as string;

const main = async () => {
  const fetcher = NostrFetcher.init();

  // get pubkeys of followees from the latest kind 3 event
  const lastFollowEvent = await fetcher.fetchLastEvent(defaultRelays, {
    kinds: [eventKind.contacts],
    authors: [pubkey],
  });
  if (lastFollowEvent === undefined) {
    console.log("contacts event (kind: 3) not found");
    return;
  }
  const followees = lastFollowEvent.tags
    .filter((t) => t.length >= 2 && t[0] === "p")
    .map((t) => t[1] as string);

  // get latest 10 posts for each followee
  const latestPostsPerFollowee = await fetcher.fetchLatestEventsPerAuthor(
    defaultRelays,
    followees,
    { kinds: [eventKind.text] },
    10
  );

  for await (const { author, events } of latestPostsPerFollowee) {
    console.log(`posts from author: ${author} (#events: ${events.length})`);
    for (const ev of events) {
      console.log(ev.content);
    }
    console.log();
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
