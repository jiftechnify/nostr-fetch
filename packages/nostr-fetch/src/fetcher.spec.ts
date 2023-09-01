import { NostrEvent } from "@nostr-fetch/kernel/nostr";
import { pubkeyFromAuthorName } from "@nostr-fetch/testutil/fakeEvent";
import { createdAtDesc } from "./fetcherHelper";
import { FakedFetcherBuilder } from "./testutil/fakedFetcher";

import { assert, describe, expect, test } from "vitest";

const collectAsyncIter = async <T>(iter: AsyncIterable<T>): Promise<T[]> => {
  const res: T[] = [];
  for await (const t of iter) {
    res.push(t);
  }
  return res;
};

/* Tests */
describe.concurrent("NostrFetcher", () => {
  const fetcher = new FakedFetcherBuilder()
    .addRelay("wss://relay1/", {
      eventsSpec: [
        {
          content: "test1 early",
          createdAt: { since: 0, until: 999 },
          n: 10,
        },
        {
          content: "test1 within range",
          createdAt: { since: 1000, until: 2000 },
          n: 10,
        },
        {
          content: "test1 late",
          createdAt: { since: 2001, until: 3000 },
          n: 10,
        },
      ],
    })
    .addRelay("wss://relay2/", {
      eventsSpec: [
        {
          content: "test2 early",
          createdAt: { since: 0, until: 999 },
          n: 10,
        },
        {
          content: "test2 within range",
          createdAt: { since: 1000, until: 2000 },
          n: 10,
        },
        {
          content: "test2 late",
          createdAt: { since: 2001, until: 3000 },
          n: 10,
        },
      ],
    })
    .addRelay("wss://relay3/", {
      eventsSpec: [
        {
          content: "test3 early",
          createdAt: { since: 0, until: 1000 },
          n: 10,
        },
        {
          content: "test3 within range",
          createdAt: { since: 1001, until: 1999 }, // it's correct because this relay is "exclusive" wrt since/until
          n: 10,
        },
        {
          content: "test3 late",
          createdAt: { since: 2000, until: 3000 },
          n: 10,
        },
      ],
      exclusiveInterval: true,
    })
    .addRelay("wss://dup1/", {
      eventsSpec: [{ content: "dup" }],
    })
    .addRelay("wss://dup2/", {
      eventsSpec: [{ content: "dup" }],
    })
    .addRelay("wss://healthy/", {
      eventsSpec: [{ content: "healthy", n: 10 }],
    })
    .addRelay("wss://invalid-sig/", {
      eventsSpec: [{ content: "invalid sig", invalidSig: true }],
    })
    .addRelay("wss://unreachable/", {
      eventsSpec: [{ content: "unreachable" }],
      connectable: false,
    })
    .addRelay("wss://slow-to-connect/", {
      eventsSpec: [{ content: "slow to connect" }],
      connectDurMs: 2000,
    })
    .addRelay("wss://slow-to-return-events/", {
      eventsSpec: [{ content: "slow to return events" }],
      sendEventInterval: 1000,
    })
    .addRelay("wss://delayed/", {
      eventsSpec: [{ content: "delayed", n: 10 }],
      sendEventInterval: 100,
    })
    .addRelay("wss://search/", {
      eventsSpec: [{ content: "search", n: 10 }],
      supportedNips: [50],
    })
    .addRelay("wss://latest1/", {
      eventsSpec: [
        { content: "test1 old", createdAt: { since: 0, until: 500 }, n: 10 },
        { content: "test1 middle", createdAt: { since: 600, until: 800 }, n: 10 },
        { content: "test1 latest", createdAt: { since: 1000, until: 2000 }, n: 10 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://latest2/", {
      eventsSpec: [
        { content: "test2 old", createdAt: { since: 0, until: 500 }, n: 10 },
        { content: "test2 middle", createdAt: { since: 600, until: 800 }, n: 10 },
        { content: "test2 latest", createdAt: { since: 1000, until: 2000 }, n: 10 },
      ],
      sendEventInterval: 10,
    })
    .addRelay("wss://latest3-with-invalid-sig/", {
      eventsSpec: [
        { content: "test3 old", createdAt: { since: 0, until: 500 }, n: 10 },
        { content: "test3 near-latest", createdAt: 999, n: 1 },
        { content: "test3 latest", createdAt: { since: 1000, until: 2000 }, n: 9 },
        {
          content: "test3 invalid",
          createdAt: { since: 1000, until: 2000 },
          invalidSig: true,
          n: 1,
        },
      ],
      sendEventInterval: 10,
    })
    .addRelay("wss://last-has-invalid-sig/", {
      eventsSpec: [{ content: "invalid", createdAt: 2001, invalidSig: true }],
    })
    .addRelay("wss://per-author1/", {
      eventsSpec: [
        { content: "test1", authorName: "alice", createdAt: { since: 0, until: 999 }, n: 10 },
        { content: "test1", authorName: "bob", createdAt: { since: 1000, until: 1999 }, n: 10 },
        { content: "test1", authorName: "cat", createdAt: { since: 2000, until: 2999 }, n: 10 },
        { content: "test1 bob last", authorName: "bob", createdAt: 5000 },
        { content: "test1 alice 2nd", authorName: "alice", createdAt: 4999 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://per-author2/", {
      eventsSpec: [
        { content: "test2", authorName: "alice", createdAt: { since: 0, until: 999 }, n: 10 },
        { content: "test2", authorName: "bob", createdAt: { since: 1000, until: 1999 }, n: 10 },
        { content: "test2", authorName: "cat", createdAt: { since: 2000, until: 2999 }, n: 10 },
        { content: "test2 cat last", authorName: "cat", createdAt: 5000 },
        { content: "test2 bob 2nd", authorName: "bob", createdAt: 4999 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://per-author3/", {
      eventsSpec: [
        { content: "test3", authorName: "alice", createdAt: { since: 0, until: 999 }, n: 10 },
        { content: "test3", authorName: "bob", createdAt: { since: 1000, until: 1999 }, n: 10 },
        { content: "test3", authorName: "cat", createdAt: { since: 2000, until: 2999 }, n: 10 },
        { content: "test3 alice last", authorName: "alice", createdAt: 5000 },
        { content: "test3 cat 2nd", authorName: "cat", createdAt: 4999 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://kinds-1/", {
      eventsSpec: [
        { content: "text", kind: 1, createdAt: { since: 0, until: 999 }, n: 10 },
        { content: "+", kind: 7, createdAt: { since: 1000, until: 1999 }, n: 5 },
      ],
    })
    .addRelay("wss://kinds-2/", {
      eventsSpec: [
        { content: "+", kind: 7, createdAt: { since: 1000, until: 1999 }, n: 5 },
        { content: "chan msg", kind: 42, createdAt: { since: 2000, until: 2999 }, n: 10 },
      ],
    })
    // 5 events for each p-tag in total
    .addRelay("wss://single-ptag/", {
      eventsSpec: [
        { content: "to alice", tags: [["p", "alice"]], n: 2 },
        { content: "to bob", tags: [["p", "bob"]], n: 2 },
        { content: "to cat", tags: [["p", "cat"]], n: 2 },
      ],
    })
    .addRelay("wss://per-author-as-of1/", {
      eventsSpec: [
        { content: "A old", authorName: "alice", createdAt: { since: 0, until: 100 }, n: 10 },
        { content: "A middle", authorName: "alice", createdAt: { since: 200, until: 400 }, n: 10 },
        { content: "B old", authorName: "bob", createdAt: { since: 0, until: 100 }, n: 10 },
        { content: "B latest", authorName: "bob", createdAt: { since: 600, until: 700 }, n: 10 },
        { content: "C middle", authorName: "cat", createdAt: { since: 200, until: 400 }, n: 10 },
        { content: "C latest", authorName: "cat", createdAt: { since: 600, until: 700 }, n: 10 },
      ],
    })
    .addRelay("wss://per-author-as-of2/", {
      eventsSpec: [
        { content: "A latest", authorName: "alice", createdAt: { since: 600, until: 700 }, n: 10 },
        { content: "B middle", authorName: "bob", createdAt: { since: 200, until: 400 }, n: 10 },
        { content: "C old", authorName: "cat", createdAt: { since: 0, until: 100 }, n: 10 },
      ],
    })
    .addRelay("wss://multi-ptag/", {
      eventsSpec: [
        {
          content: "to alice and bob",
          tags: [
            ["p", "alice"],
            ["p", "bob"],
          ],
        },
        {
          content: "to alice and cat",
          tags: [
            ["p", "alice"],
            ["p", "cat"],
          ],
        },
        {
          content: "to bob and cat",
          tags: [
            ["p", "bob"],
            ["p", "cat"],
          ],
        },
        {
          content: "to all",
          tags: [
            ["p", "alice"],
            ["p", "bob"],
            ["p", "cat"],
          ],
        },
      ],
    })
    .buildFetcher();

  describe.concurrent("allEventsIterator", () => {
    test("fetches all events (single relay)", async () => {
      const evIter = fetcher.allEventsIterator(["wss://relay1/"], {}, {}, { limitPerReq: 5 });
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(30);
    });

    test("fetches all events (multiple relays)", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://relay1/", "wss://relay2/", "wss://relay3/"],
        {},
        {},
        { limitPerReq: 5 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(90);
    });

    test("fetches all events within time range (single relay)", async () => {
      const evIter = fetcher.allEventsIterator(["wss://relay1/"], {}, { since: 1000, until: 2000 });
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("within range")));
    });

    test("fetches all events within time range (multiple relays)", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://relay1/", "wss://relay2/", "wss://relay3/"],
        {},
        { since: 1000, until: 2000 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(30);
      assert(evs.every(({ content }) => content.includes("within range")));
    });

    test("throws error if time range is invalid", () => {
      expect(() => {
        fetcher.allEventsIterator(["wss://healthy/"], {}, { since: 1, until: 0 });
      }).toThrow("Invalid time range (since > until)");
    });

    test("dedups events based on event id", async () => {
      const evIter = fetcher.allEventsIterator(["wss://dup1/", "wss://dup2/"], {}, {});
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(1);
    });

    test("sends the same event multiple times with updated seenOn", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://dup1/", "wss://dup2/"],
        {},
        {},
        { withSeenOn: true },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(2);

      const [fst, snd] = evs.map((ev) => ev.seenOn) as [string[], string[]];
      assert(fst.length === 1 && (fst.includes("wss://dup1/") || fst.includes("wss://dup2/")));
      expect(snd).toEqual(expect.arrayContaining(["wss://dup1/", "wss://dup2/"]));
    });

    test("verifies signature by default", async () => {
      const evIter = fetcher.allEventsIterator(["wss://healthy/", "wss://invalid-sig/"], {}, {});
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("skips signature verification if skipVerification is true", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://invalid-sig/"],
        {},
        {},
        { skipVerification: true },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(({ content }) => content.includes("healthy") || content.includes("invalid sig")),
      );
    });

    test("ignores unreachable relays", async () => {
      const evIter = fetcher.allEventsIterator(["wss://healthy/", "wss://unreachable/"], {}, {});
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("skips slow-to-connect relays if timeout exceeds", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://slow-to-connect/"],
        {},
        {},
        { connectTimeoutMs: 1000 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("waits slow-to-connect relays until timeout", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://slow-to-connect/"],
        {},
        {},
        { connectTimeoutMs: 3000 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(
          ({ content }) => content.includes("healthy") || content.includes("slow to connect"),
        ),
      );
    });

    test("cut off slow-to-return-events relays if timeout exceeds", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://slow-to-return-events/"],
        {},
        {},
        { abortSubBeforeEoseTimeoutMs: 100 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("waits slow-to-return-events relays until timeout", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://slow-to-return-events/"],
        {},
        {},
        { abortSubBeforeEoseTimeoutMs: 2000 },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(
          ({ content }) => content.includes("healthy") || content.includes("slow to return event"),
        ),
      );
    });

    test("can be aborted by AbortController", async () => {
      const ac = new AbortController();
      setTimeout(() => {
        ac.abort();
      }, 500);

      const evIter = fetcher.allEventsIterator(
        ["wss://delayed/"],
        {},
        {},
        { abortSignal: ac.signal },
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBeLessThan(10);
    });

    test("uses only searchable relays (supports NIP-50) if the filter contains search field", async () => {
      const evIter = fetcher.allEventsIterator(
        ["wss://healthy/", "wss://search/"],
        { search: "search" },
        {},
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("search")));
    });
  });

  describe.concurrent("fetchAllEvents", () => {
    test("throws error if time range is invalid", async () => {
      await expect(() =>
        fetcher.fetchAllEvents(["wss://healthy/"], {}, { since: 1, until: 0 }),
      ).rejects.toThrow("Invalid time range (since > until)");
    });

    test("sorts result if sort: true", async () => {
      const evs = await fetcher.fetchAllEvents(
        ["wss://relay1/", "wss://relay2/", "wss://relay3/"],
        {},
        {},
        { sort: true },
      );
      const sorted = evs.slice().sort(createdAtDesc);
      expect(evs).toStrictEqual(sorted);
    });

    test("withSeenOn: true works correctly", async () => {
      const evs = await fetcher.fetchAllEvents(
        ["wss://dup1/", "wss://dup2/"],
        {},
        {},
        { withSeenOn: true },
      );
      expect(evs.length).toBe(1);
      expect(evs[0]?.seenOn).toEqual(expect.arrayContaining(["wss://dup1/", "wss://dup2/"]));
    });
  });

  describe.concurrent("fetchLatestEvents", () => {
    test("throws error if limit <= 0", async () => {
      await expect(() => fetcher.fetchLatestEvents(["wss://healthy/"], {}, 0)).rejects.toThrow(
        '"limit" should be positive number',
      );
    });

    test("fetches latest N events", async () => {
      const evs = await fetcher.fetchLatestEvents(["wss://latest1/", "wss://latest2/"], {}, 20);
      expect(evs.length).toBe(20);
      assert(evs.every(({ content }) => content.includes("latest")));

      const sorted = evs.slice().sort(createdAtDesc);
      expect(evs).toStrictEqual(sorted);
    });

    test("fetches latest N events as of specified time", async () => {
      // "middle" events have timestamp 600-800
      const evs = await fetcher.fetchLatestEvents(["wss://latest1/", "wss://latest2/"], {}, 20, {
        asOf: 900,
      });
      expect(evs.length).toBe(20);
      assert(evs.every(({ content }) => content.includes("middle")));

      const sorted = evs.slice().sort(createdAtDesc);
      expect(evs).toStrictEqual(sorted);
    });

    test("moves up near-latest events in reduced verification mode", async () => {
      const evs = await fetcher.fetchLatestEvents(
        ["wss://latest1/", "wss://latest3-with-invalid-sig/"],
        {},
        20,
        {
          reduceVerification: true,
        },
      );
      expect(evs.length).toBe(20);
      assert(evs.every(({ content }) => content.includes("latest")));
      assert(evs.some(({ content }) => content.includes("near-latest")));
    });

    test("withSeenOn: true works correctly", async () => {
      const evs = await fetcher.fetchLatestEvents(["wss://dup1/", "wss://dup2/"], {}, 1, {
        withSeenOn: true,
      });
      expect(evs.length).toBe(1);
      expect(evs[0]?.seenOn).toEqual(expect.arrayContaining(["wss://dup1/", "wss://dup2/"]));
    });
  });

  describe.concurrent("fetchLastEvent", () => {
    test("moves up second-last event in reduced verification mode", async () => {
      const ev = await fetcher.fetchLastEvent(
        ["wss://latest1/", "wss://last-has-invalid-sig/"],
        {},
        {
          reduceVerification: true,
        },
      );
      expect(ev).not.toBeUndefined();
      assert(ev?.content?.includes("latest"));
    });

    test("returns undefined if no events match the filter", async () => {
      const ev = await fetcher.fetchLastEvent(["wss://healthy/"], {
        authors: [pubkeyFromAuthorName("nobody")], // in "healthy" relay, the author of all events is "test"
      });
      expect(ev).toBeUndefined();
    });
  });

  describe.concurrent("fetchLatestEventsPerKey", () => {
    const pkA = pubkeyFromAuthorName("alice");
    const pkB = pubkeyFromAuthorName("bob");
    const pkC = pubkeyFromAuthorName("cat");

    test("relay set for all authors", async () => {
      const iter = fetcher.fetchLatestEventsPerKey(
        "authors",
        {
          keys: [pkA, pkB, pkC],
          relayUrls: ["wss://per-author1/", "wss://per-author2/", "wss://per-author3/"],
        },
        {},
        5,
      );
      const authors: string[] = [];

      for await (const { key: author, events } of iter) {
        authors.push(author);

        expect(events.length).toBe(5);
        assert(events.every((ev) => ev.pubkey === author));

        // check if events are sorted
        const sorted = events.slice().sort(createdAtDesc);
        expect(events).toStrictEqual(sorted);
      }
      // all events of pkC > all events of pkB > all events of pkA, where `>` is "after than"
      // so events of pkC should be returned first, then events of pkB, then events of pkA.
      expect(authors).toStrictEqual([pkC, pkB, pkA]);
    });

    test("relay set per author", async () => {
      const relaySetPerAuthor = new Map([
        [pkA, ["wss://per-author1/", "wss://per-author2/"]],
        [pkB, ["wss://per-author2/", "wss://per-author3/"]],
        [pkC, ["wss://per-author3/", "wss://per-author1/"]],
      ]);

      const eventsPerAuthor = new Map<string, NostrEvent[]>();

      const iter = fetcher.fetchLatestEventsPerKey("authors", relaySetPerAuthor, {}, 5);
      for await (const { key: author, events } of iter) {
        eventsPerAuthor.set(author, events);

        expect(events.length).toBe(5);
        assert(events.every((ev) => ev.pubkey === author));

        // check if events are sorted
        const sorted = events.slice().sort(createdAtDesc);
        expect(events).toStrictEqual(sorted);
      }

      // check if events are fetched from only specified relays for each author
      /* eslint-disable @typescript-eslint/no-non-null-assertion */
      assert(
        eventsPerAuthor
          .get(pkA)!
          .every(({ content }) => content.includes("test1") || content.includes("test2")),
      );
      assert(
        eventsPerAuthor
          .get(pkB)!
          .every(({ content }) => content.includes("test2") || content.includes("test3")),
      );
      assert(
        eventsPerAuthor
          .get(pkC)!
          .every(({ content }) => content.includes("test3") || content.includes("test1")),
      );
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
    });

    test("asOf works correctly", async () => {
      const iter = fetcher.fetchLatestEventsPerKey(
        "authors",
        {
          keys: [pkA, pkB, pkC],
          relayUrls: ["wss://per-author-as-of1/", "wss://per-author-as-of2/"],
        },
        {},
        10,
        { asOf: 500 },
      );
      for await (const { events } of iter) {
        expect(events.length).toBe(10);
        assert(events.every((ev) => ev.content.includes("middle")));

        // check if events are sorted
        const sorted = events.slice().sort(createdAtDesc);
        expect(events).toStrictEqual(sorted);
      }
    });

    test("withSeenOn: true works correctly", async () => {
      const iter = fetcher.fetchLatestEventsPerKey(
        "authors",
        { keys: [pubkeyFromAuthorName("test")], relayUrls: ["wss://dup1/", "wss://dup2/"] },
        {},
        1,
        {
          withSeenOn: true,
        },
      );
      const res = await collectAsyncIter(iter);
      expect(res.length).toBe(1);
      expect(res[0]?.events[0]?.seenOn).toEqual(
        expect.arrayContaining(["wss://dup1/", "wss://dup2/"]),
      );
    });

    test("fetch events per kind", async () => {
      const iter = fetcher.fetchLatestEventsPerKey(
        "kinds",
        { keys: [1, 7, 42], relayUrls: ["wss://kinds-1/", "wss://kinds-2/"] },
        {},
        10,
      );

      for await (const { key: kind, events } of iter) {
        expect(events.length).toBe(10);
        assert(events.every((ev) => ev.kind === kind));

        // check if events are sorted
        const sorted = events.slice().sort(createdAtDesc);
        expect(events).toStrictEqual(sorted);
      }
    });

    test("fetch events per p-tag", async () => {
      const iter = fetcher.fetchLatestEventsPerKey(
        "#p",
        { keys: ["alice", "bob", "cat"], relayUrls: ["wss://single-ptag/", "wss://multi-ptag/"] },
        {},
        5,
      );

      for await (const { key: pTag, events } of iter) {
        expect(events.length).toBe(5);
        assert(
          events.every((ev) => ev.tags.filter((t) => t[0] === "p").some((t) => t[1] === pTag)),
        );
      }
    });
  });

  describe.concurrent("fetchLastEventPerkey", () => {
    const pkA = pubkeyFromAuthorName("alice");
    const pkB = pubkeyFromAuthorName("bob");
    const pkC = pubkeyFromAuthorName("cat");

    test("single relay set for all authors", async () => {
      const iter = fetcher.fetchLastEventPerKey(
        "authors",
        {
          keys: [pkA, pkB, pkC],
          relayUrls: ["wss://per-author1/", "wss://per-author2/", "wss://per-author3/"],
        },
        {},
      );

      const authors: string[] = [];
      for await (const { key: author, event } of iter) {
        authors.push(author);

        // check if the fetched event is actually the last event from the author
        assert(event !== undefined && event.pubkey === author && event.content.includes("last"));
      }
      // check if we got the last event for all authors
      expect(authors).toEqual(expect.arrayContaining([pkA, pkB, pkC]));
    });

    test("relay set per author", async () => {
      // for each author, only the 2nd-last event can be found
      const relaySetPerAuthor = new Map([
        [pkA, ["wss://per-author1/", "wss://per-author2/"]],
        [pkB, ["wss://per-author2/", "wss://per-author3/"]],
        [pkC, ["wss://per-author3/", "wss://per-author1/"]],
      ]);
      const iter = fetcher.fetchLastEventPerKey("authors", relaySetPerAuthor, {});

      const authors: string[] = [];

      for await (const { key: author, event } of iter) {
        authors.push(author);

        // check if the fetched event is the 2nd-last event from the author
        assert(event !== undefined && event.pubkey === author && event.content.includes("2nd"));
      }
      // check if we got the last event for all authors
      expect(authors).toEqual(expect.arrayContaining([pkA, pkB, pkC]));
    });
  });
});
