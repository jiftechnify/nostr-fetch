import { fail } from "assert";
import { describe, expect, test } from "vitest";
import { NostrEvent, parseR2CMessage, validateEvent } from "./nostr";

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
    const unknownMsgJSON = [`["UNKNOWN"]`, `["OK", "event_id", true, ""]`, `["AUTH", "challange"]`];

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

  test("fails on malformed NOTICE message", () => {
    const malformedNoticeJSON = [`["NOTICE"]`];

    for (const msgJSON of malformedNoticeJSON) {
      expect(parseR2CMessage(msgJSON)).toBeUndefined();
    }
  });
});

const validEvent = JSON.parse(validEventJSON) as Record<keyof NostrEvent, unknown>;

const modifiedEvent = (
  mod: Partial<Record<keyof NostrEvent, unknown>>
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
