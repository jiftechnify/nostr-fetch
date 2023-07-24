import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { NostrEvent } from "./nostr";

const utf8Encoder = new TextEncoder();

// verifies the signature of the Nostr event
export const verifyEventSig = (ev: NostrEvent): boolean => {
  const serializedEv = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  const evHash = bytesToHex(sha256(utf8Encoder.encode(serializedEv)));
  return schnorr.verify(ev.sig, evHash, ev.pubkey);
};
