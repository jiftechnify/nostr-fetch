/**
 * The data structure of Nostr event.
 */
export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

/**
 * Standardized Nostr event kinds.
 * cf. https://github.com/nostr-protocol/nips#event-kinds
 */
export const eventKind = {
  metadata: 0,
  text: 1,
  recommendRelay: 2,
  contacts: 3,
  encryptedDirectMessage: 4,
  eventDeletion: 5,
  repost: 6,
  reaction: 7,
  badgeAward: 8,
  genericRepost: 16,
  channelCreation: 40,
  channelMetadata: 41,
  channelMessage: 42,
  channelHideMessage: 43,
  channelMuteUser: 44,
  fileMetadata: 1063,
  liveChatMessage: 1311,
  report: 1984,
  label: 1985,
  communityPostApproval: 4550,
  zapRequest: 9734,
  zap: 9735,
  muteList: 10000,
  pinList: 10001,
  relayList: 10002,
  walletInfo: 13194,
  clientAuth: 22242,
  walletRequest: 23194,
  walletResponse: 23195,
  nostrConnect: 24133,
  httpAuth: 27235,
  categorizedPeopleList: 30000,
  categorizedBookmarkList: 30001,
  profileBadges: 30008,
  badgeDefinition: 30009,
  marketplaceStall: 30017,
  marketplaceProduct: 30018,
  article: 30023,
  draftArticle: 30024,
  appSpecificData: 30078,
  liveEvent: 30311,
  classifiedListing: 30402,
  draftClassifiedListing: 30403,
  dateBasedCalendarEvent: 31922,
  timeBasedCalendarEvent: 31923,
  calendar: 31924,
  calendarEventRsvp: 31925,
  handlerRecommendation: 31989,
  handlerInformation: 31990,
  communityDefinition: 34550,
} as const;

/**
 * Standardized single letter tag names.
 * cf. https://github.com/nostr-protocol/nips#standardized-tags
 */
type SingleLetterTags = "a" | "d" | "e" | "g" | "i" | "k" | "l" | "L" | "m" | "p" | "r" | "t" | "x";

/**
 * Keys of filter props for tag queries.
 */
type TagQueryKey = `#${SingleLetterTags}`;

/**
 * Filter for Nostr event subscription.
 */
export type Filter = {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
} & {
  [tag in TagQueryKey]?: string[];
};

// client to relay messages
type C2RReq = [type: "REQ", subId: string, ...filters: Filter[]];
type C2RClose = [type: "CLOSE", subId: string];

export type C2RMessage = C2RReq | C2RClose;
export type C2RMessageType = C2RMessage[0];

// relay to client messages
type R2CEvent = [type: "EVENT", subId: string, event: NostrEvent];
type R2CEose = [type: "EOSE", subId: string];
type R2CClosed = [type: "CLOSED", subId: string, message: string];
type R2CNotice = [type: "NOTICE", notice: string];

export type R2CMessage = R2CEvent | R2CEose | R2CClosed | R2CNotice;
export type R2CMessageType = R2CMessage[0];

export type R2CSubMessage = R2CEvent | R2CEose;
export type R2CSubMessageType = R2CSubMessage[0];

const supportedR2CMsgTypes: R2CMessageType[] = ["EVENT", "EOSE", "CLOSED", "NOTICE"];
const isSupportedR2CMsgType = (s: string): s is R2CMessageType =>
  (supportedR2CMsgTypes as string[]).includes(s);

export const parseR2CMessage = (rawMsg: string): R2CMessage | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMsg) as unknown;
  } catch (err) {
    console.error("failed to parse R2C message as JSON:", err);
    return undefined;
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== "string") {
    console.error("malformed R2C message");
    return undefined;
  }

  const msgType = parsed[0] as string;
  if (!isSupportedR2CMsgType(msgType)) {
    console.error("unsupported R2C message type:", parsed[0]);
    return undefined;
  }
  switch (msgType) {
    case "EVENT": {
      if (parsed.length !== 3) {
        console.error("malformed R2C EVENT");
        return undefined;
      }
      const [, subId, ev] = parsed;
      if (typeof subId !== "string" || typeof ev !== "object" || ev === null) {
        console.error("malformed R2C EVENT");
        return undefined;
      }
      if (!validateEvent(ev)) {
        console.error("malformed event in R2C EVENT");
        return undefined;
      }
      return parsed as R2CEvent;
    }
    case "EOSE": {
      if (parsed.length !== 2 || typeof parsed[1] !== "string") {
        console.error("malformed R2C EOSE");
        return undefined;
      }
      return parsed as R2CEose;
    }
    case "CLOSED": {
      if (parsed.length !== 3 || typeof parsed[1] !== "string" || typeof parsed[2] !== "string") {
        console.error("malformed R2C CLOSED");
        return undefined;
      }
      return parsed as R2CClosed;
    }
    case "NOTICE": {
      if (parsed.length !== 2) {
        console.error("malformed R2C NOTICE");
        return undefined;
      }
      return parsed as R2CNotice;
    }
    default:
      return undefined;
  }
};

// schema validation for Nostr events
export const validateEvent = (rawEv: Record<string, unknown>): rawEv is NostrEvent => {
  // id: 32-bytes lowercase hex-encoded sha256
  if (!("id" in rawEv) || typeof rawEv["id"] !== "string" || !is32BytesHexStr(rawEv["id"])) {
    return false;
  }

  // pubkey: 32-bytes lowercase hex-encoded public key
  if (
    !("pubkey" in rawEv) ||
    typeof rawEv["pubkey"] !== "string" ||
    !is32BytesHexStr(rawEv["pubkey"])
  ) {
    return false;
  }

  // created_at: unix timestamp in seconds
  if (!("created_at" in rawEv) || typeof rawEv["created_at"] !== "number") {
    return false;
  }

  // kind: integer
  if (!("kind" in rawEv) || typeof rawEv["kind"] !== "number") {
    return false;
  }

  // tags: array of arrays of non-null strings
  if (!("tags" in rawEv) || !Array.isArray(rawEv["tags"])) {
    return false;
  }
  if (rawEv["tags"].some((tag) => !Array.isArray(tag) || tag.some((e) => typeof e !== "string"))) {
    return false;
  }

  // content: string
  if (!("content" in rawEv) || typeof rawEv["content"] !== "string") {
    return false;
  }

  // sig: 64-bytes hex of the signature
  if (!("sig" in rawEv) || typeof rawEv["sig"] !== "string" || !is64BytesHexStr(rawEv["sig"])) {
    return false;
  }

  return true;
};

const is32BytesHexStr = (s: string): boolean => {
  return /^[a-f0-9]{64}$/.test(s);
};

const is64BytesHexStr = (s: string): boolean => {
  return /^[a-f0-9]{128}$/.test(s);
};

type CompiledFilter = {
  ids: Set<string> | undefined;
  kinds: Set<number> | undefined;
  authors: Set<string> | undefined;
  tags: [string, Set<string>][];
  since: number | undefined;
  until: number | undefined;
};

const compileFilter = (f: Filter): CompiledFilter => {
  const ids = f.ids ? new Set(f.ids) : undefined;
  const kinds = f.kinds ? new Set(f.kinds) : undefined;
  const authors = f.authors ? new Set(f.authors) : undefined;

  const tags: [string, Set<string>][] = [];
  for (const k of Object.keys(f)) {
    if (k.startsWith("#") && k.length === 2) {
      tags.push([k.charAt(1), new Set(f[k as TagQueryKey] ?? [])] as [string, Set<string>]);
    }
  }
  return { ids, kinds, authors, tags, since: f.since, until: f.until };
};

const getTagValuesByName = (ev: NostrEvent, tagName: string): string[] =>
  ev.tags.filter((t) => t[0] === tagName).map((t) => t[1] ?? "");

const matchWithCompiledFilter = (f: CompiledFilter, ev: NostrEvent): boolean => {
  if (f.ids !== undefined && !f.ids.has(ev.id)) {
    return false;
  }
  if (f.kinds !== undefined && !f.kinds.has(ev.kind)) {
    return false;
  }
  if (f.authors !== undefined && !f.authors.has(ev.pubkey)) {
    return false;
  }
  if (f.since !== undefined && ev.created_at < f.since) {
    return false;
  }
  if (f.until !== undefined && ev.created_at > f.until) {
    return false;
  }
  const tagMatched = f.tags.every(([tagName, queryVals]) => {
    const tagVals = getTagValuesByName(ev, tagName);
    if (tagVals.length === 0) {
      // required tag is missing
      return false;
    }
    return tagVals.some((e) => queryVals.has(e));
  });
  return tagMatched;
};

export class FilterMatcher {
  #filters: CompiledFilter[];

  constructor(filters: Filter[]) {
    this.#filters = filters.map(compileFilter);
  }

  public match(ev: NostrEvent): boolean {
    return this.#filters.some((f) => matchWithCompiledFilter(f, ev));
  }
}

/* Check Relay's Capabilities */
/**
 * Queries supported NIP numbers of the given relay.
 */
export const querySupportedNips = async (relayUrl: string): Promise<Set<number>> => {
  try {
    const httpUrl = toHttpUrl(relayUrl);

    const abortCtrl = new AbortController();
    const abortTimer = setTimeout(() => {
      abortCtrl.abort();
    }, 5000);

    const resp = await fetch(httpUrl, {
      headers: { Accept: "application/nostr+json" },
      signal: abortCtrl.signal,
    });
    clearTimeout(abortTimer);

    if (!resp.ok) {
      console.error("relay information response is not ok");
      return new Set();
    }

    const relayInfo = await resp.json();
    if (!relayInfoHasSupportedNips(relayInfo)) {
      console.error("relay information document doesn't have proper 'supported_nips' property");
      return new Set();
    }
    return new Set(relayInfo.supported_nips);
  } catch (err) {
    console.error(err);
    return new Set();
  }
};

const toHttpUrl = (url: string): string => {
  const u = new URL(url);
  switch (u.protocol) {
    case "wss:":
      u.protocol = "https:";
      break;
    case "ws:":
      u.protocol = "http:";
      break;
  }
  return u.toString();
};

type RelayInfoWithSupportedNips = {
  supported_nips: number[];
};

const relayInfoHasSupportedNips = (relayInfo: unknown): relayInfo is RelayInfoWithSupportedNips =>
  typeof relayInfo === "object" &&
  relayInfo !== null &&
  "supported_nips" in relayInfo &&
  Array.isArray(relayInfo.supported_nips) &&
  (relayInfo.supported_nips.length === 0 ||
    relayInfo.supported_nips.every((e: unknown) => typeof e === "number"));

/* Utilities */
// utility to generate a random subscription ID
export const generateSubId = () => {
  return Date.now().toString() + Math.random().toString(32).substring(2, 4);
};

const reqErrRegexps = [
  /^too many concurrent REQs$/i,
  /^Subscription rejected/i,
  /^invalid:(.*)must (contain|be) less than or equal to/i,
  /^message too large$/i,
  /^Maximum concurrent subscription count reached$/i,
];

/**
 * Checks if the NOTICE message seems to have to do with REQs by fetcher.
 *
 * Considers following relay implementations:
 *
 * - strfry
 * - nostream
 * - nostr-rs-relay
 * - relayer
 */
export const isNoticeForReqError = (notice: string): boolean =>
  reqErrRegexps.some((r) => r.test(notice));
