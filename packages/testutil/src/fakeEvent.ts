import { NostrEvent } from "@nostr-fetch/kernel/nostr";

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { finishEvent, getPublicKey } from "nostr-tools";

/**
 * Generating fake Nostr events for testing
 */

export type FakeEventsSpec = {
  content: string;
  createdAt?: number | { since: number; until: number };
  authorName?: string;
  invalidSig?: boolean;
  n?: number;
};

const genCreatedAt = (spec: number | { since: number; until: number }): number => {
  if (typeof spec === "number") {
    return spec;
  }
  // random integer between since and until (includes both endpoint)
  const d = Math.floor(Math.random() * (spec.until - spec.since + 1));
  return spec.since + d;
};

export const privkeyFromAuthorName = (name: string) => bytesToHex(sha256(name));
export const pubkeyFromAuthorName = (name: string) => getPublicKey(privkeyFromAuthorName(name));

export const generateFakeEvents = (spec: FakeEventsSpec): NostrEvent[] => {
  const { content, createdAt, authorName, invalidSig, n } = {
    ...{ createdAt: 0, authorName: "test", invalidSig: false, n: 1 },
    ...spec,
  };
  const privkey = privkeyFromAuthorName(authorName);

  const res: NostrEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = {
      kind: 1,
      tags: [],
      content: `${content} ${i}`,
      created_at: genCreatedAt(createdAt),
    };
    const signed = finishEvent(ev, privkey);

    if (invalidSig) {
      // change first char of the signature
      signed.sig = `${signed.sig[0] === "0" ? "1" : "0"}${signed.sig.slice(1)}`;
    }
    res.push(signed);
  }
  return res;
};
