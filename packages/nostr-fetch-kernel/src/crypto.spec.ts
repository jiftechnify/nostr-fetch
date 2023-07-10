import { describe, expect, test } from "vitest";
import { verifyEventSig } from "./crypto";
import { NostrEvent } from "./nostr";

const validEvent: NostrEvent = {
  id: "381e2ea15a5b16f4ebdaa68ed3d9a112dc4ea6cc95641ef7eb57f1ec826f07e4",
  pubkey: "d1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44",
  created_at: 1678892115,
  kind: 1,
  tags: [],
  content: "テスト用",
  sig: "644d8a7267d624bd861d4f53e97a637a6aea9c1f7e08e4f3cbe68087dbcd6aa9925c58fedd650815fa56e6d6733064e5bba1e58fc2210257bb30e717ba63b46c",
};

describe("verifyEventSig", () => {
  test("returns true if a signature of an event is valid", () => {
    expect(verifyEventSig(validEvent)).toEqual(true);
  });

  test("returns false if a signature of an event is invalid", () => {
    const invalidSig = validEvent.sig.replace(/0/g, "1");
    validEvent.sig = invalidSig;
    expect(verifyEventSig(validEvent)).toEqual(false);
  });
});
