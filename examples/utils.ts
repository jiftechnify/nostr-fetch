export const nHoursAgo = (hrs: number): number =>
  Math.floor(new Date(Date.now() - hrs * 60 * 60 * 1000).getTime() / 1000);

export const defaultRelays = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://nostr.h3z.jp",
  "wss://nostr.holybea.com",
];
