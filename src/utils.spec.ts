import { describe, expect, test } from "vitest";
import { normalizeRelayUrl, normalizeRelayUrls } from "./utils";

describe("normalizeRelayUrl", () => {
  test("normalizes a relay url", () => {
    const cases = [
      { input: "wss://relay.example.com/", exp: "wss://relay.example.com/" },
      { input: "wss://relay.example.com", exp: "wss://relay.example.com/" },
      {
        input: "wss://relay.example.com/remove//seq//slashes",
        exp: "wss://relay.example.com/remove/seq/slashes",
      },
      {
        input: "wss://relay.example.com/trim/trailing/slash/",
        exp: "wss://relay.example.com/trim/trailing/slash",
      },
      { input: "ws://relay.example.com:80", exp: "ws://relay.example.com/" },
      { input: "wss://relay.example.com:443", exp: "wss://relay.example.com/" },
      { input: "wss://relay.example.com?b=2&a=1", exp: "wss://relay.example.com/?a=1&b=2" },
      { input: "wss://relay.example.com#hash", exp: "wss://relay.example.com/" },
    ];

    for (const { input, exp } of cases) {
      expect(normalizeRelayUrl(input)).toBe(exp);
    }
  });
});

describe("normalizeRelayUrls", () => {
  test("normalizes relay urls and dedup", () => {
    expect(
      normalizeRelayUrls([
        "wss://relay.example.com/",
        "wss://relay.example.com",
        "wss://relay.example.com:443",
        "wss://relay.example.com#hash",
      ])
    ).toStrictEqual(["wss://relay.example.com/"]);
  });
});
