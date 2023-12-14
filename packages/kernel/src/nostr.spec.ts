import { fail } from "assert";
import { describe, expect, test } from "vitest";
import {
  FilterMatcher,
  NostrEvent,
  isNoticeForReqError,
  parseR2CMessage,
  validateEvent,
} from "./nostr";

const validEventJSON = `{
  "id": "381e2ea15a5b16f4ebdaa68ed3d9a112dc4ea6cc95641ef7eb57f1ec826f07e4",
  "pubkey": "d1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44",
  "created_at": 1678892115,
  "kind": 1,
  "tags": [],
  "content": "テスト用",
  "sig": "644d8a7267d624bd861d4f53e97a637a6aea9c1f7e08e4f3cbe68087dbcd6aa9925c58fedd650815fa56e6d6733064e5bba1e58fc2210257bb30e717ba63b46c"
}`;

describe("parseR2CMessage", () => {
  test("parses EVENT message", () => {
    const eventJSON = `["EVENT", "sub_id", ${validEventJSON}]`;

    const parsed = parseR2CMessage(eventJSON);
    if (parsed === undefined) {
      fail("parsing failed unexpectedly");
    }
    if (parsed[0] !== "EVENT") {
      fail(`unexpected message type: ${parsed[0]}`);
    }
    const [, subId, event] = parsed;
    expect(subId).toBe("sub_id");
    expect(event).toStrictEqual(JSON.parse(validEventJSON));
  });

  test("parses EOSE message", () => {
    const eoseJSON = `["EOSE", "sub_id"]`;

    const parsed = parseR2CMessage(eoseJSON);
    if (parsed === undefined) {
      fail("parsing failed unexpectedly");
    }
    if (parsed[0] !== "EOSE") {
      fail(`unexpected message type: ${parsed[0]}`);
    }
    const [, subId] = parsed;
    expect(subId).toBe("sub_id");
  });

  test("parses CLOSED message", () => {
    const closedJSON = `["CLOSED", "sub_id", "reason"]`;

    const parsed = parseR2CMessage(closedJSON);
    if (parsed === undefined) {
      fail("parsing failed unexpectedly");
    }
    if (parsed[0] !== "CLOSED") {
      fail(`unexpected message type: ${parsed[0]}`);
    }
    const [, subId, reason] = parsed;
    expect(subId).toBe("sub_id");
    expect(reason).toBe("reason");
  });

  test("parses NOTICE message", () => {
    const noticeJSON = `["NOTICE", "error!"]`;

    const parsed = parseR2CMessage(noticeJSON);
    if (parsed === undefined) {
      fail("parsing failed unexpecedly");
    }
    if (parsed[0] !== "NOTICE") {
      fail(`unexpected message type: ${parsed[0]}`);
    }
    const [, msg] = parsed;
    expect(msg).toBe("error!");
  });

  test("fails on malformed message", () => {
    const malformedMsgJSON = ["", `{"type":"OK"}`, "[]", "[1]"];

    for (const msgJSON of malformedMsgJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });

  test("fails on unknown/ignored message type", () => {
    const unknownMsgJSON = [`["UNKNOWN"]`, `["OK", "event_id", true, ""]`, `["AUTH", "challenge"]`];

    for (const msgJSON of unknownMsgJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });

  test("fails on malformed EVENT message", () => {
    const malformedEventJSON = [
      `["EVENT"]`,
      `["EVENT", "sub_id"]`,
      `["EVENT", "sub_id", 42]`,
      `["EVENT", "sub_id", null]`,
      `["EVENT", 100, ${validEventJSON}]`,
    ];

    for (const msgJSON of malformedEventJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });

  test("fails on malformed EOSE message", () => {
    const malformedEoseJSON = [`["EOSE"]`, `["EOSE", 42]`, `["EOSE", null]`];

    for (const msgJSON of malformedEoseJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });

  test("fails on malformed CLOSED message", () => {
    const malformedClosedJSON = [
      `["CLOSED"]`,
      `["CLOSED", 42]`,
      `["CLOSED", null]`,
      `["CLOSED", "sub_id", null]`,
    ];

    for (const msgJSON of malformedClosedJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });

  test("fails on malformed NOTICE message", () => {
    const malformedNoticeJSON = [`["NOTICE"]`];

    for (const msgJSON of malformedNoticeJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });
});

const validEvent = JSON.parse(validEventJSON) as Record<keyof NostrEvent, unknown>;

const modifiedEvent = (
  mod: Partial<Record<keyof NostrEvent, unknown>>,
): Record<string, unknown> => {
  return { ...validEvent, ...mod };
};

const propDeletedEvent = (key: keyof NostrEvent): Record<string, unknown> => {
  const copy = { ...validEvent };
  delete copy[key];
  return copy;
};

describe("validateEvent", () => {
  test("fails on malformed id", () => {
    const malformedEvs = [
      propDeletedEvent("id"),
      modifiedEvent({ id: 1 }),
      modifiedEvent({ id: "not-sha256" }),
      modifiedEvent({
        id: "644d8a7267d624bd861d4f53e97a637a6aea9c1f7e08e4f3cbe68087dbcd6aa9925c58fedd650815fa56e6d6733064e5bba1e58fc2210257bb30e717ba63b46c", // invalid length
      }),
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed pubkey", () => {
    const malformedEvs = [
      propDeletedEvent("pubkey"),
      modifiedEvent({ pubkey: 1 }),
      modifiedEvent({ pubkey: "not hex str" }),
      modifiedEvent({
        pubkey:
          "644d8a7267d624bd861d4f53e97a637a6aea9c1f7e08e4f3cbe68087dbcd6aa9925c58fedd650815fa56e6d6733064e5bba1e58fc2210257bb30e717ba63b46c", // invalid length
      }),
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed created_at", () => {
    const malformedEvs = [
      propDeletedEvent("created_at"),
      modifiedEvent({ created_at: "2023-03-16T00:35:00" }),
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed kind", () => {
    const malformedEvs = [propDeletedEvent("kind"), modifiedEvent({ kind: "text_note" })];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed tags", () => {
    const malformedEvs = [
      propDeletedEvent("tags"),
      modifiedEvent({ tags: { non: "array" } }),
      modifiedEvent({ tags: ["not array of array"] }),
      modifiedEvent({ tags: [["contains non-string", 42]] }),
      modifiedEvent({ tags: [["contains null", null]] }),
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed content", () => {
    const malformedEvs = [
      propDeletedEvent("content"),
      modifiedEvent({ content: 42 }),
      modifiedEvent({ content: null }),
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });

  test("fails on malformed sig", () => {
    const malformedEvs = [
      propDeletedEvent("sig"),
      modifiedEvent({ sig: 1 }),
      modifiedEvent({ sig: "not hex str" }),
      modifiedEvent({ sig: "d1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44" }), // invalid length
    ];
    for (const ev of malformedEvs) {
      expect(validateEvent(ev)).toBe(false);
    }
  });
});

describe("FilterMatcher", () => {
  const ev = {
    id: "id1",
    pubkey: "pk1",
    created_at: 1629123456,
    kind: 1,
    tags: [
      ["e", "e1"],
      ["p", "p1"],
    ],
    content: "",
    sig: "sig",
  };

  test("should return true when event matches the filter", () => {
    const filters = [
      {},
      { ids: ["id1"] },
      { ids: ["id1", "id2"] },
      { kinds: [1] },
      { kinds: [1, 2] },
      { authors: ["pk1"] },
      { authors: ["pk1", "pk2"] },
      { "#e": ["e1"] },
      { "#e": ["e1", "e2"] },
      { "#p": ["p1"] },
      { "#p": ["p1", "p2"] },
      { since: 1629000000, until: 1630000000 },
      { since: 1629000000 },
      { since: 1629123456 }, // matches if since == created_at
      { until: 1630000000 },
      { until: 1629123456 }, // matches if until == created_at
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        since: 1629000000,
        until: 1630000000,
      },
    ];
    for (const f of filters) {
      const matcher = new FilterMatcher([f]);
      expect(matcher.match(ev)).toBe(true);
    }
  });

  test("should return false when event does not match the filter", () => {
    const filters = [
      { ids: ["id2"] },
      { ids: ["id2", "id3"] },
      { kinds: [2] },
      { kinds: [2, 3] },
      { authors: ["pk2"] },
      { authors: ["pk2", "pk3"] },
      { "#e": ["e2"] },
      { "#e": ["e2", "e3"] },
      { "#p": ["p2"] },
      { "#p": ["p2", "p3"] },
      { "#a": ["a1"] }, // missing tag
      { since: 1630000000 },
      { until: 1629000000 },
      // matches except one filter...
      {
        ids: ["id2"], // mismatch
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [2], // mismatch
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk2"], // mismatch
        "#e": ["e1"],
        "#p": ["p1"],
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e2"], // mismatch
        "#p": ["p1"],
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p2"], // mismatch
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        "#a": ["a1"], // missing tag
        since: 1629000000,
        until: 1630000000,
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        since: 1630000000, // mismatch
      },
      {
        ids: ["id1"],
        kinds: [1],
        authors: ["pk1"],
        "#e": ["e1"],
        "#p": ["p1"],
        until: 1629000000, // mismatch
      },
    ];

    for (const f of filters) {
      const matcher = new FilterMatcher([f]);
      const matched = matcher.match(ev);
      console.log(f, matched);
      expect(matched).toBe(false);
    }
  });

  test("should return true if at least one filter matches", () => {
    const f = new FilterMatcher([
      { ids: ["id2"] },
      { kinds: [2] },
      { "#a": ["a1"] },
      { since: 1630000000 },
      { authors: ["pk1"] }, // matches
    ]);
    expect(f.match(ev)).toBe(true);
  });

  test("should return false if no filters match", () => {
    const f = new FilterMatcher([
      { ids: ["id2"] },
      { kinds: [2] },
      { "#a": ["a1"] },
      { since: 1630000000 },
      { authors: ["pk2"] },
    ]);
    expect(f.match(ev)).toBe(false);
  });
});

describe("isNoticeForReqError", () => {
  test("returns true if notice message stands for REQ errors can be caused by nostr-fetch", () => {
    const noticeForReqErr = [
      "too many concurrent REQs",
      "Subscription rejected: Too many subscriptions",
      'invalid: "ids" must contain less than or equal to 1000',
      'invalid: "[2].limit" must be less than or equal to 5000',
      "message too large",
      "Maximum concurrent subscription count reached",
    ];
    for (const notice of noticeForReqErr) {
      expect(isNoticeForReqError(notice)).toBe(true);
    }
  });
});
