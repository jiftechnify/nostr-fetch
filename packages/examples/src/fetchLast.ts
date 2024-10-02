import { NostrFetcher } from "nostr-fetch";
import WebSocket from "ws";

import { defaultRelays } from "./utils";

const main = async () => {
  const fetcher = NostrFetcher.init({ webSocketConstructor: WebSocket });

  // fetch the last metadata event (kind 0) and contact list event (kind 3) published by the pubkey from the relays
  const [lastMetadata, lastContacts] = await Promise.all(
    [0, 3].map((kind) =>
      fetcher.fetchLastEvent(defaultRelays, {
        kinds: [kind],
        authors: ["d1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44"],
      }),
    ),
  );

  console.log("last metadata:", lastMetadata);
  console.log("last contact list:", lastContacts);
  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
