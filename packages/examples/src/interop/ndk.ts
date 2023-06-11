import NDK from "@nostr-dev-kit/ndk";
import { ndkAdapter } from "@nostr-fetch/adapter-ndk";
import { NostrFetcher, eventKind, normalizeRelayUrls } from "nostr-fetch";
import { defaultRelays, nHoursAgo } from "../utils";

import "websocket-polyfill";

// You should normalize relay URLs by `normalizeRelayUrls` before passing them to NDK's constructor if working with nostr-fetch!
const explicitRelays = normalizeRelayUrls([
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://relay.damus.io",
]);

const main = async () => {
  // initialize fetcher based on NDK
  const ndk = new NDK({ explicitRelayUrls: explicitRelays });
  await ndk.connect();
  const fetcher = NostrFetcher.withCustomPool(ndkAdapter(ndk));

  // fetch all text events (kind: 1) posted in the last hour from the relays
  const eventsIter = await fetcher.allEventsIterator(
    defaultRelays,
    {
      kinds: [eventKind.text],
    },
    {
      since: nHoursAgo(1),
    },
    {
      skipVerification: true,
    }
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
