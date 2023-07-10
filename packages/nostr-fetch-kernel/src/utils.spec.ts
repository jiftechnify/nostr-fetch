import { describe, expect, test } from "vitest";
import { abbreviate, normalizeRelayUrl, normalizeRelayUrls, withTimeout } from "./utils";

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
      ]),
    ).toStrictEqual(["wss://relay.example.com/"]);
  });
});

describe("abbreviate", () => {
  test("abbreviates long strings", () => {
    const cases = [
      { affixLen: 1, exp: "1:d" },
      { affixLen: 2, exp: "12:cd" },
      { affixLen: 3, exp: "123:bcd" },
      { affixLen: 4, exp: "1234:abcd" },
    ];

    for (const { affixLen, exp } of cases) {
      expect(abbreviate("1234_abcd", affixLen)).toBe(exp);
    }
  });

  test("returns original string if affixLen is too big or invalid", () => {
    const cases = [5, 0, -1];
    for (const affixLen of cases) {
      expect(abbreviate("1234_abcd", affixLen)).toBe("1234_abcd");
    }
  });
});

describe("withTimeout", () => {
  test.concurrent("timeouts", () => {
    const promise = new Promise((resolve) =>
      setTimeout(() => {
        resolve("ok");
      }, 5000),
    );
    return expect(withTimeout(promise, 3000, "timed out!")).rejects.toThrow("timed out!");
  });

  test.concurrent(
    "resolves with original value if original promise resolves before timeout",
    () => {
      const promise = new Promise((resolve) =>
        setTimeout(() => {
          resolve("ok");
        }, 1000),
      );
      return expect(withTimeout(promise, 3000, "timed out!")).resolves.toBe("ok");
    },
  );

  test.concurrent("rejects with original error if original promise rejects before timeout", () => {
    const promise = new Promise((_, reject) =>
      setTimeout(() => {
        reject("err");
      }, 1000),
    );
    return expect(withTimeout(promise, 3000, "timed out!")).rejects.toThrow("err");
  });
});
