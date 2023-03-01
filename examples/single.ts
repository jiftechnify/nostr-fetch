import "websocket-polyfill";
import { eventKind, fetchAllEvents } from "../src/index";

const nDaysAgo = (days: number): number =>
  Math.floor(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).getTime() / 1000
  );

if (process.argv.length <= 2) {
  console.error("specify relay URL");
  process.exit(1);
}
const relayUrl = process.argv[2] as string;

const main = async () => {
  // fetch all text events (kind: 1) posted in last week from the relay
  const evs = await fetchAllEvents(
    relayUrl,
    [
      {
        kinds: [eventKind.text],
        // authors: ["<your pubkey (hex)>"],
      },
    ],
    {
      since: nDaysAgo(7),
    },
    { verifyEventSig: false }
  );
  console.log(`fetched ${evs.length} events`);
};

main()
  .then(() => console.log("fin"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
