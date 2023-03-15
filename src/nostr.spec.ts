import { describe, expect, test } from "vitest";
import { parseR2CMessage } from "./nostr";

describe("parseR2CMessage", () => {
  test("fails on malformed JSON string", () => {
    expect(parseR2CMessage("")).toBeUndefined();
  });
});
