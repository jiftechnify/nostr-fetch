import { eventKind, NostrFetcher } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays } from "./utils";

const getName = (content: string | undefined): string | undefined =>
  content ? JSON.parse(content)["name"] : undefined;

if (process.argv.length <= 2) {
  console.error("usage: fetchLastPerAuthor <hex pubkey>");
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

  // get profile (metadata) events for each followee
  const profilePerAuthor = fetcher.fetchLastEventPerAuthor(
    { authors: followees, relayUrls: defaultRelays },
    {
      kinds: [eventKind.metadata],
    },
  );

  // display the name in profile for each author
  console.log(`${"pubkey".padEnd(64, " ")} | name`);
  console.log(`${"-".repeat(64)} | ----`);
  for await (const { author, event } of profilePerAuthor) {
    console.log(`${author} | ${getName(event?.content) ?? "(not found)"}`);
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
