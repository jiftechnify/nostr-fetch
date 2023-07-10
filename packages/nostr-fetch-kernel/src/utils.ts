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
 *
 *  This function also filters out malformed URLs.
 */
export const normalizeRelayUrls = (relayUrls: string[]): string[] => {
  return dedup(
    relayUrls
      .filter((u) => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      })
      .map((u) => normalizeRelayUrl(u)),
  );
};

/**
 *  Empty AsyncGenerator
 */
// eslint-disable-next-line require-yield
export async function* emptyAsyncGen() {
  return;
}

/**
 * Abbreviates strings as:
 * <first `affixLen` chars of `s`> + ":" + <last `affixLen` chars of `s`>
 *
 * if `s.length` is less than `affixLen * 2` or `affixLen` is not positive, just returns original string.
 */
export const abbreviate = (s: string, affixLen: number): string => {
  if (s.length <= affixLen * 2 || affixLen <= 0) {
    return s;
  }
  const len = s.length;
  return `${s.slice(0, affixLen)}:${s.slice(len - affixLen)}`;
};

/**
 * Attaches timeout to the `promise`.
 *
 * If the `promise` is not settled by the time limit, returned promise rejects with the error which has the specified message.
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  msgOnTimeout: string,
): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Error(msgOnTimeout)), timeoutMs);
  });

  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
};
