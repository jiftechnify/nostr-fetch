import "websocket-polyfill";
import { eventKind, NostrEvent, NostrFetcher } from "../src/index";
import { defaultRelays } from "./utils";

if (process.argv.length <= 2) {
  console.error("specify hex pubkey");
  process.exit(1);
}
const pubkey = process.argv[2] as string;

const getName = (content: string): string => {
  return JSON.parse(content).name ?? "name not found";
};

const main = async () => {
  const fetcher = NostrFetcher.init();

  // get pubkeys of followees from the latest kind 3 event
  const lastFollowEvent = await fetcher.fetchLastEvent(defaultRelays, [
    { kinds: [eventKind.contacts], authors: [pubkey] },
  ]);
  if (lastFollowEvent === undefined) {
    console.log("contacts event (kind: 3) not found");
    return;
  }
  const followees = lastFollowEvent.tags
    .filter((t) => t.length >= 2 && t[0] === "p")
    .map((t) => t[1] as string);

  // get pubkeys of followers by querying kind 3 events which contain your pubkey
  const followingMeEvents = await fetcher.fetchAllEvents(
    defaultRelays,
    [{ kinds: [eventKind.contacts], "#p": [pubkey] }],
    {}
  );
  const followers = Array.from(new Set(followingMeEvents.map((ev) => ev.pubkey)));

  // get latest metadata event published by followees and followers
  const pubkeysInFollowRel = Array.from(new Set([...followees, ...followers]));
  const latestMetadatas = await fetcher.fetchLatestEvents(
    defaultRelays,
    [{ kinds: [eventKind.metadata], authors: pubkeysInFollowRel }],
    pubkeysInFollowRel.length * 2
  );
  const latestMetadataPerAuthor = new Map<string, NostrEvent>();
  for (const e of latestMetadatas) {
    if (!latestMetadataPerAuthor.has(e.pubkey)) {
      latestMetadataPerAuthor.set(e.pubkey, e);
    }
  }

  // show the result
  console.log(`${followees.length} followees:`);
  for (const pk of followees) {
    const m = latestMetadataPerAuthor.get(pk);
    console.log(`${pk}: ${m ? getName(m.content) : "metadata not found"}`);
  }

  console.log(`${followers.length} followers:`);
  for (const pk of followers) {
    const m = latestMetadataPerAuthor.get(pk);
    console.log(`${pk}: ${m ? getName(m.content) : "metadata not found"}`);
  }

  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
