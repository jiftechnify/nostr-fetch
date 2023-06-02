/**
 * Current unxitime in milliseconds.
 */
export const currUnixtimeMilli = (now = new Date()): number => now.getTime();

/**
 * Current unixtime in seconds.
 */
export const currUnixtimeSec = (now = new Date()): number =>
  Math.floor(currUnixtimeMilli(now) / 1000);

// borrowed from nostr-tools (https://github.com/nbd-wtf/nostr-tools).
export const normalizeRelayUrl = (urlStr: string): string => {
  const url = new URL(urlStr);

  url.pathname = url.pathname.replace(/\/+/g, "/");
  if (url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  if (
    (url.port === "80" && url.protocol === "ws:") ||
    (url.port === "443" && url.protocol === "wss:")
  ) {
    url.port = "";
  }

  url.searchParams.sort();
  url.hash = "";
  return url.toString();
};

const dedup = <T>(items: T[]): T[] => {
  return Array.from(new Set(items));
};

/**
 *  Normalizes each relay URL in `relayUrls`, then removes duplications.
 */
export const normalizeRelayUrls = (relayUrls: string[]): string[] => {
  return dedup(relayUrls.map((u) => normalizeRelayUrl(u)));
};

/**
 *  Empty AsyncGenerator
 */
// eslint-disable-next-line require-yield
export async function* emptyAsyncGen() {
  return;
}
