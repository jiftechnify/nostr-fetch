import { sha256 } from "@noble/hashes/sha256";
import * as secp256k1 from "@noble/secp256k1";
import type { NostrEvent } from "./nostr";

// to use `verifySync`, you need to set up `secp256k1.utils.sha256Sync`.
secp256k1.utils.sha256Sync = (...msgs) => sha256(secp256k1.utils.concatBytes(...msgs));

const utf8Encoder = new TextEncoder();

// verifies the signature of the Nostr event
export const verifyEventSig = (ev: NostrEvent): boolean => {
  const serializedEv = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  const evHash = secp256k1.utils.bytesToHex(sha256(utf8Encoder.encode(serializedEv)));
  return secp256k1.schnorr.verifySync(ev.sig, evHash, ev.pubkey);
};
