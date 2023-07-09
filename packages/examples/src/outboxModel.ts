import { setTimeout } from "node:timers/promises";
import { eventKind, NostrEvent, NostrFetcher } from "nostr-fetch";
import "websocket-polyfill";

import { defaultRelays, getWriteRelaysFromEvent } from "./utils";

if (process.argv.length <= 2) {
  console.error("usage: outboxModel <hex pubkey>");
  process.exit(1);
}
const pubkey = process.argv[2] as string;

const fetcher = NostrFetcher.init({});

// fetch pubkeys of followees from the latest kind 3 event
const fetchFollowees = async (pubkey: string): Promise<string[]> => {
  const ev = await fetcher.fetchLastEvent(defaultRelays, {
    kinds: [eventKind.contacts],
    authors: [pubkey],
  });
  if (ev === undefined) {
    return [];
  }
  return ev.tags.filter((t) => t.length >= 2 && t[0] === "p").map((t) => t[1] as string);
};

// get write relays for each pubkeys. appends default relays as fallback.
const fetchWriteRelaysPerAuthors = async (authors: string[]): Promise<Map<string, string[]>> => {
  const iter = fetcher.fetchLastEventPerAuthor(
    { authors, relayUrls: defaultRelays },
    {
      kinds: [eventKind.contacts, eventKind.relayList],
    }
  );
  const res = new Map<string, string[]>();
  for await (const { author, event: ev } of iter) {
    const wrs = ev ? getWriteRelaysFromEvent(ev) : [];
    res.set(author, [...wrs, ...defaultRelays]);
  }
  return res;
};

const main = async () => {
  console.log("fetching follow list...");
  const followees = await fetchFollowees(pubkey);
  if (followees.length === 0) {
    console.error("contacts event (kind: 3) not found or you haven't followed any users");
    return;
  }

  console.log("fetching a list of write relay for each followee...");
  const writeRelaysPerFollowees = await fetchWriteRelaysPerAuthors(followees);

  // get the last post for each followee
  console.log("fetching the last post from followees...");
  const lastPostsPerFollowee = fetcher.fetchLastEventPerAuthor(
    writeRelaysPerFollowees,
    {
      kinds: [eventKind.text],
    },
    { statsListener: (stats) => console.error(stats) }
  );
  for await (const { author, event: ev } of lastPostsPerFollowee) {
    if (ev !== undefined) {
      printPost(ev);
    } else {
      console.log(`post from author: [${author}] not found`);
    }
  }
};

const printPost = (ev: NostrEvent) => {
  console.log(
    `last post from author: [${ev.pubkey}] (${new Date(ev.created_at * 1000).toLocaleString()})`
  );
  console.log(ev.content);
  console.log();
};

main()
  .then(() => {
    console.log("fin");
    fetcher.shutdown();
    return setTimeout(1000).then(process.exit(0));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
