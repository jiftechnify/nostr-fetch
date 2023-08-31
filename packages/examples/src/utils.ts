import { NostrEvent, eventKind } from "nostr-fetch";

export const nHoursAgo = (hrs: number): number =>
  Math.floor((Date.now() - hrs * 60 * 60 * 1000) / 1000);

export const defaultRelays = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nrelay.c-stellar.net",
  "wss://nostr.holybea.com",
  "wss://nostr-relay.nokotaro.com",
  "wss://relay.damus.io",
];

export const getWriteRelaysFromEvent = (ev: NostrEvent): string[] => {
  switch (ev.kind) {
    case eventKind.contacts: {
      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(ev.content);
      } catch (err) {
        return [];
      }
      const es = Object.entries(
        parsedContent as Record<string, { read?: boolean; write?: boolean }>,
      );
      return es.filter(([, usage]) => usage.write ?? false).map(([relay]) => relay);
    }

    case eventKind.relayList: {
      return ev.tags
        .filter((t) => {
          if (t.length < 2 || t[0] !== "r") {
            return false;
          }
          if (t.length === 2) {
            // ["r", "relay-url"] -> read/write relays, keep
            return true;
          }
          // ["r", "relay-url", "read|write"] -> keep "write" relays only
          return t[2] === "write";
        })
        .map(([, relayUrl]) => relayUrl as string);
    }

    default:
      throw Error("getRelaysToWriteFromEvent: unreachable!");
  }
};
