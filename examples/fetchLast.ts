import "websocket-polyfill";
import { eventKind, NostrFetcher } from "../src/index";
import { defaultRelays } from "./utils";

const main = async () => {
  const fetcher = new NostrFetcher();

  // fetch the last metadata event (kind: 0) by the pubkey from the relays
  const lastMetadata = await fetcher.fetchLastEvent(defaultRelays, [
    {
      kinds: [eventKind.metadata],
      // the pubkey of library author, for example
      authors: ["d1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44"],
    },
  ]);

  console.log("last metadata:", lastMetadata);
  fetcher.shutdown();
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
