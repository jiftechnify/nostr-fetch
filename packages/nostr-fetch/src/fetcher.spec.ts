import {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBase,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBase";
import { Filter, NostrEvent, generateSubId } from "@nostr-fetch/kernel/nostr";
import {
  emptyAsyncGen,
  normalizeRelayUrl,
  normalizeRelayUrls,
  withTimeout,
} from "@nostr-fetch/kernel/utils";
import { RelayCapabilityChecker, createdAtDesc } from "./fetcherHelper";

import { setTimeout as delay } from "node:timers/promises";

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Channel } from "@nostr-fetch/kernel/channel";
import { finishEvent, getPublicKey, verifySignature } from "nostr-tools";

import { assert, describe, expect, test } from "vitest";
import { NostrFetcher } from "./fetcher";

type FakeEventsSpec = {
  content: string;
  createdAtSpec: number | { since: number; until: number };
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

const privkeyFromAuthorName = (name: string) => bytesToHex(sha256(name));
const pubkeyFromAuthorName = (name: string) => getPublicKey(privkeyFromAuthorName(name));

const generateFakeEvents = (spec: FakeEventsSpec): NostrEvent[] => {
  const { content, createdAtSpec, authorName, invalidSig, n } = {
    ...{ authorName: "test", invalidSig: false, n: 1 },
    ...spec,
  };
  const privkey = privkeyFromAuthorName(authorName);

  const res: NostrEvent[] = [];
  for (let i = 0; i < n; i++) {
    const ev = {
      kind: 1,
      tags: [],
      content: `${content} ${i}`,
      created_at: genCreatedAt(createdAtSpec),
    };
    const signed = finishEvent(ev, privkey);

    if (invalidSig) {
      signed.sig = "";
    }
    res.push(signed);
  }
  return res;
};

type FakeRelaySpec = {
  eventsSpec: FakeEventsSpec[];
  connectable?: boolean;
  connectDurMs?: number;
  supportedNips?: number[];
  sendEventInterval?: number;
  exclusiveInterval?: boolean;
};

const afterSince = (ev: NostrEvent, since: number, exclusiveInterval: boolean): boolean =>
  (exclusiveInterval && ev.created_at > since) || (!exclusiveInterval && ev.created_at >= since);

const beforeUntil = (ev: NostrEvent, until: number, exclusiveInterval: boolean): boolean =>
  (exclusiveInterval && ev.created_at < until) || (!exclusiveInterval && ev.created_at <= until);

const matchEvent = (ev: NostrEvent, f: Filter, exclusiveInterval: boolean): boolean => {
  if (f.ids !== undefined && !f.ids.includes(ev.id)) {
    return false;
  }
  if (f.authors !== undefined && !f.authors.includes(ev.pubkey)) {
    return false;
  }
  if (f.kinds !== undefined && !f.kinds.includes(ev.kind)) {
    return false;
  }
  if (f.search !== undefined && !ev.content.includes(f.search)) {
    return false;
  }
  if (f.since !== undefined && !afterSince(ev, f.since, exclusiveInterval)) {
    return false;
  }
  if (f.until !== undefined && !beforeUntil(ev, f.until, exclusiveInterval)) {
    return false;
  }
  return true;
};

class FakeRelay {
  #spec: Required<FakeRelaySpec>;
  #events: NostrEvent[] = [];

  #subs: Set<string> = new Set();

  constructor(spec: FakeRelaySpec) {
    this.#spec = {
      ...{
        connectable: true,
        connectDurMs: 0,
        supportedNips: [],
        sendEventInterval: 0,
        exclusiveInterval: false,
      },
      ...spec,
    };

    const evs = spec.eventsSpec.flatMap((spec) => generateFakeEvents(spec));
    this.#events = evs.sort(createdAtDesc);
  }

  async connect(): Promise<void> {
    if (this.#spec.connectDurMs > 0) {
      await delay(this.#spec.connectDurMs);
    }

    if (this.#spec.connectable) {
      return Promise.resolve();
    } else {
      return Promise.reject(Error("failed to connect to the relay"));
    }
  }

  req(
    filter: Filter,
    subId: string,
    onEvent: (ev: NostrEvent) => void,
    onEose: () => void
  ): () => void {
    this.#subs.add(subId);

    (async () => {
      let n = 0;

      for (const ev of this.#events) {
        if (!this.#subs.has(subId)) {
          return;
        }
        if (n >= (filter.limit ?? 500)) {
          onEose();
          return;
        }
        if (
          filter.since !== undefined &&
          !afterSince(ev, filter.since, this.#spec.exclusiveInterval)
        ) {
          onEose();
          return;
        }

        if (matchEvent(ev, filter, this.#spec.exclusiveInterval)) {
          if (this.#spec.sendEventInterval > 0) {
            await delay(this.#spec.sendEventInterval);
          }
          onEvent(ev);
          n++;
        }
      }
      // events exhausted
      onEose();
    })();

    return () => {
      this.#subs.delete(subId);
    };
  }

  close(subId: string): void {
    this.#subs.delete(subId);
  }
}

class FakeFetcherBase implements NostrFetcherBase {
  #mapFakeRelay: Map<string, FakeRelay> = new Map();

  #calledShutdown = false;

  constructor(relaySpecs: Map<string, FakeRelaySpec>) {
    this.#mapFakeRelay = new Map(
      [...relaySpecs.entries()].map(([rurl, spec]) => [rurl, new FakeRelay(spec)])
    );
  }

  async ensureRelays(relayUrls: string[], options: EnsureRelaysOptions): Promise<string[]> {
    const connected: string[] = [];
    const normalizedUrls = normalizeRelayUrls(relayUrls);
    await Promise.all(
      normalizedUrls.map(async (rurl) => {
        const relay = this.#mapFakeRelay.get(rurl);
        if (relay === undefined) {
          console.error("relay not found");
          return;
        }

        try {
          await withTimeout(relay.connect(), options.connectTimeoutMs, "connection timed out");
          connected.push(rurl);
        } catch (err) {
          console.error(err);
        }
      })
    );
    return connected;
  }

  fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const relay = this.#mapFakeRelay.get(normalizeRelayUrl(relayUrl));
    if (relay === undefined) {
      return emptyAsyncGen();
    }

    const [tx, iter] = Channel.make<NostrEvent>();
    const onEvent = (ev: NostrEvent) => {
      if (options.skipVerification || verifySignature(ev)) {
        tx.send(ev);
      }
    };
    const onEose = () => {
      tx.close();
    };

    const unsub = relay.req(filter, generateSubId(), onEvent, onEose);

    const abortSub = () => {
      unsub();
      tx.close();
    };

    // auto abortion
    let subAutoAbortTimer: NodeJS.Timer | undefined;
    const resetAutoAbortTimer = () => {
      if (subAutoAbortTimer !== undefined) {
        clearTimeout(subAutoAbortTimer);
        subAutoAbortTimer = undefined;
      }
      subAutoAbortTimer = setTimeout(() => abortSub(), options.abortSubBeforeEoseTimeoutMs);
    };
    resetAutoAbortTimer(); // initiate subscription auto abortion timer

    // handle abortion by AbortController
    if (options.abortSignal?.aborted) {
      abortSub();
    }
    options.abortSignal?.addEventListener("abort", () => abortSub());

    return iter;
  }

  shutdown(): void {
    this.#calledShutdown = true;
  }
  get calledShutdown(): boolean {
    return this.#calledShutdown;
  }
}

class FakeRelayCapChecker implements RelayCapabilityChecker {
  #mapSupportedNips: Map<string, Set<number>>;

  constructor(relaySpecs: Map<string, FakeRelaySpec>) {
    this.#mapSupportedNips = new Map();
    for (const [rurl, spec] of relaySpecs) {
      this.#mapSupportedNips.set(rurl, new Set(spec.supportedNips ?? []));
    }
  }

  async relaySupportsNips(relayUrl: string, requiredNips: number[]): Promise<boolean> {
    const supportSet = this.#mapSupportedNips.get(normalizeRelayUrl(relayUrl));
    return supportSet !== undefined && requiredNips.every((nip) => supportSet.has(nip));
  }
}

class FakedFetcherBuilder {
  #mapFakeRelaySpec: Map<string, FakeRelaySpec> = new Map();

  addRelay(relayUrl: string, spec: FakeRelaySpec): FakedFetcherBuilder {
    this.#mapFakeRelaySpec.set(normalizeRelayUrl(relayUrl), spec);
    return this;
  }

  buildFetcher(opts: NostrFetcherCommonOptions = {}): NostrFetcher {
    const base = () => new FakeFetcherBase(this.#mapFakeRelaySpec);
    const capChecker = () => new FakeRelayCapChecker(this.#mapFakeRelaySpec);
    return NostrFetcher.withCustomPool(base, opts, capChecker);
  }
}

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
    .addRelay("wss://relay1", {
      eventsSpec: [
        {
          content: "test1 early",
          createdAtSpec: { since: 0, until: 999 },
          n: 10,
        },
        {
          content: "test1 within range",
          createdAtSpec: { since: 1000, until: 2000 },
          n: 10,
        },
        {
          content: "test1 late",
          createdAtSpec: { since: 2001, until: 3000 },
          n: 10,
        },
      ],
    })
    .addRelay("wss://relay2", {
      eventsSpec: [
        {
          content: "test2 early",
          createdAtSpec: { since: 0, until: 999 },
          n: 10,
        },
        {
          content: "test2 within range",
          createdAtSpec: { since: 1000, until: 2000 },
          n: 10,
        },
        {
          content: "test2 late",
          createdAtSpec: { since: 2001, until: 3000 },
          n: 10,
        },
      ],
    })
    .addRelay("wss://relay3", {
      eventsSpec: [
        {
          content: "test3 early",
          createdAtSpec: { since: 0, until: 1000 },
          n: 10,
        },
        {
          content: "test3 within range",
          createdAtSpec: { since: 1001, until: 1999 }, // it's correct bacause this relay is "exclusive" wrt since/until
          n: 10,
        },
        {
          content: "test3 late",
          createdAtSpec: { since: 2000, until: 3000 },
          n: 10,
        },
      ],
      exclusiveInterval: true,
    })
    .addRelay("wss://dup1", {
      eventsSpec: [{ content: "dup", createdAtSpec: 0 }],
    })
    .addRelay("wss://dup2", {
      eventsSpec: [{ content: "dup", createdAtSpec: 0 }],
    })
    .addRelay("wss://healthy", {
      eventsSpec: [{ content: "healthy", createdAtSpec: 0, n: 10 }],
    })
    .addRelay("wss://invalid-sig", {
      eventsSpec: [{ content: "invalid sig", createdAtSpec: 0, invalidSig: true }],
    })
    .addRelay("wss://unreachable", {
      eventsSpec: [{ content: "unreachable", createdAtSpec: 0 }],
      connectable: false,
    })
    .addRelay("wss://slow-to-connect", {
      eventsSpec: [{ content: "slow to connect", createdAtSpec: 0 }],
      connectDurMs: 2000,
    })
    .addRelay("wss://slow-to-return-events", {
      eventsSpec: [{ content: "slow to return events", createdAtSpec: 0 }],
      sendEventInterval: 1000,
    })
    .addRelay("wss://delayed", {
      eventsSpec: [{ content: "delayed", createdAtSpec: 0, n: 10 }],
      sendEventInterval: 100,
    })
    .addRelay("wss://search", {
      eventsSpec: [{ content: "search", createdAtSpec: 0, n: 10 }],
      supportedNips: [50],
    })
    .addRelay("wss://latest1", {
      eventsSpec: [
        { content: "test1 old", createdAtSpec: { since: 0, until: 500 }, n: 10 },
        { content: "test1 latest", createdAtSpec: { since: 1000, until: 2000 }, n: 10 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://latest2", {
      eventsSpec: [
        { content: "test2 old", createdAtSpec: { since: 0, until: 500 }, n: 10 },
        { content: "test2 latest", createdAtSpec: { since: 1000, until: 2000 }, n: 10 },
      ],
      sendEventInterval: 10,
    })
    .addRelay("wss://latest3-with-invalid-sig", {
      eventsSpec: [
        { content: "test3 old", createdAtSpec: { since: 0, until: 500 }, n: 10 },
        { content: "test3 near-latest", createdAtSpec: 750, n: 1 },
        { content: "test3 latest", createdAtSpec: { since: 1000, until: 2000 }, n: 9 },
        {
          content: "test3 invalid",
          createdAtSpec: { since: 1000, until: 2000 },
          invalidSig: true,
          n: 1,
        },
      ],
      sendEventInterval: 10,
    })
    .addRelay("wss://last-has-invalid-sig", {
      eventsSpec: [{ content: "invalid", createdAtSpec: 2001, invalidSig: true }],
    })
    .addRelay("wss://per-author1", {
      eventsSpec: [
        { content: "test1", authorName: "alice", createdAtSpec: { since: 0, until: 999 }, n: 10 },
        { content: "test1", authorName: "bob", createdAtSpec: { since: 1000, until: 1999 }, n: 10 },
        { content: "test1", authorName: "cat", createdAtSpec: { since: 2000, until: 2999 }, n: 10 },
        { content: "test1 bob last", authorName: "bob", createdAtSpec: 5000 },
        { content: "test1 alice 2nd", authorName: "alice", createdAtSpec: 4999 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://per-author2", {
      eventsSpec: [
        { content: "test2", authorName: "alice", createdAtSpec: { since: 0, until: 999 }, n: 10 },
        { content: "test2", authorName: "bob", createdAtSpec: { since: 1000, until: 1999 }, n: 10 },
        { content: "test2", authorName: "cat", createdAtSpec: { since: 2000, until: 2999 }, n: 10 },
        { content: "test2 cat last", authorName: "cat", createdAtSpec: 5000 },
        { content: "test2 bob 2nd", authorName: "bob", createdAtSpec: 4999 },
      ],
      sendEventInterval: 5,
    })
    .addRelay("wss://per-author3", {
      eventsSpec: [
        { content: "test3", authorName: "alice", createdAtSpec: { since: 0, until: 999 }, n: 10 },
        { content: "test3", authorName: "bob", createdAtSpec: { since: 1000, until: 1999 }, n: 10 },
        { content: "test3", authorName: "cat", createdAtSpec: { since: 2000, until: 2999 }, n: 10 },
        { content: "test3 alice last", authorName: "alice", createdAtSpec: 5000 },
        { content: "test3 cat 2nd", authorName: "cat", createdAtSpec: 4999 },
      ],
      sendEventInterval: 5,
    })
    .buildFetcher();

  describe.concurrent("allEventsIterator", () => {
    test("fetches all events (single relay)", async () => {
      const evIter = await fetcher.allEventsIterator(["wss://relay1"], {}, {}, { limitPerReq: 5 });
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(30);
    });

    test("fetches all events (multiple relays)", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://relay1", "wss://relay2", "wss://relay3"],
        {},
        {},
        { limitPerReq: 5 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(90);
    });

    test("fetches all events within time range (single relay)", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://relay1"],
        {},
        { since: 1000, until: 2000 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("within range")));
    });

    test("fetches all events within time range (multiple relays)", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://relay1", "wss://relay2", "wss://relay3"],
        {},
        { since: 1000, until: 2000 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(30);
      assert(evs.every(({ content }) => content.includes("within range")));
    });

    test("dedups events based on event id", async () => {
      const evIter = await fetcher.allEventsIterator(["wss://dup1", "wss://dup2"], {}, {});
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(1);
    });

    test("verifies signature by default", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://invalid-sig"],
        {},
        {}
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("skips signature verification if skipVerification is true", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://invalid-sig"],
        {},
        {},
        { skipVerification: true }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(({ content }) => content.includes("healthy") || content.includes("invalid sig"))
      );
    });

    test("ignores unreachable relays", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://unreachable"],
        {},
        {}
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("skips slow-to-connect relays if timeout exceeds", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://slow-to-connect"],
        {},
        {},
        { connectTimeoutMs: 1000 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("waits slow-to-connect relays until timeout", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://slow-to-connect"],
        {},
        {},
        { connectTimeoutMs: 3000 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(
          ({ content }) => content.includes("healthy") || content.includes("slow to connect")
        )
      );
    });

    test("cut off slow-to-return-events relays if timeout exceeds", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://slow-to-return-events"],
        {},
        {},
        { abortSubBeforeEoseTimeoutMs: 500 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("healthy")));
    });

    test("waits slow-to-return-events relays until timeout", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healthy", "wss://slow-to-return-events"],
        {},
        {},
        { abortSubBeforeEoseTimeoutMs: 2000 }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(11);
      assert(
        evs.every(
          ({ content }) => content.includes("healthy") || content.includes("slow to return event")
        )
      );
    });

    test("can be aborted by AbortController", async () => {
      const ac = new AbortController();
      setTimeout(() => {
        ac.abort();
      }, 500);

      const evIter = await fetcher.allEventsIterator(
        ["wss://delayed"],
        {},
        {},
        { abortSignal: ac.signal }
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBeLessThan(10);
    });

    test("uses only searchable relays (supports NIP-50) if the filter contains search field", async () => {
      const evIter = await fetcher.allEventsIterator(
        ["wss://healty", "wss://search"],
        { search: "search" },
        {}
      );
      const evs = await collectAsyncIter(evIter);
      expect(evs.length).toBe(10);
      assert(evs.every(({ content }) => content.includes("search")));
    });
  });

  describe.concurrent("fetchAllEvents", () => {
    test("sorts result if sort: true", async () => {
      const evs = await fetcher.fetchAllEvents(
        ["wss://relay1", "wss://relay2", "wss://relay3"],
        {},
        {},
        { sort: true }
      );
      const sorted = evs.slice().sort(createdAtDesc);
      expect(evs).toStrictEqual(sorted);
    });
  });

  describe.concurrent("fetchLatestEvents", () => {
    test("throws error if limit <= 0", async () => {
      await expect(fetcher.fetchLatestEvents(["wss://healthy"], {}, 0)).rejects.toThrow(
        '"limit" should be positive number'
      );
    });

    test("fetches latest N events", async () => {
      const evs = await fetcher.fetchLatestEvents(["wss://latest1", "wss://latest2"], {}, 20);
      expect(evs.length).toBe(20);
      assert(evs.every(({ content }) => content.includes("latest")));

      const sorted = evs.slice().sort(createdAtDesc);
      expect(evs).toStrictEqual(sorted);
    });

    test("moves up near-latest events in reduced verification mode", async () => {
      const evs = await fetcher.fetchLatestEvents(
        ["wss://latest1", "wss://latest3-with-invalid-sig"],
        {},
        20,
        {
          reduceVerification: true,
        }
      );
      expect(evs.length).toBe(20);
      assert(evs.every(({ content }) => content.includes("latest")));
      assert(evs.some(({ content }) => content.includes("near-latest")));
    });
  });

  describe.concurrent("fetchLastEvent", () => {
    test("moves up second-last event in reduced verification mode", async () => {
      const ev = await fetcher.fetchLastEvent(
        ["wss://latest1", "wss://last-has-invalid-sig"],
        {},
        {
          reduceVerification: true,
        }
      );
      expect(ev).not.toBeUndefined();
      assert(ev?.content?.includes("latest"));
    });

    test("returns undefined if no events match the filter", async () => {
      const ev = await fetcher.fetchLastEvent(["wss://healthy"], {
        authors: [pubkeyFromAuthorName("nobody")], // in "healthy" relay, the author of all events is "test"
      });
      expect(ev).toBeUndefined();
    });
  });

  describe.concurrent("fetchLatestEventsPerAuthor", () => {
    const pkA = pubkeyFromAuthorName("alice");
    const pkB = pubkeyFromAuthorName("bob");
    const pkC = pubkeyFromAuthorName("cat");

    test("relay set for all authors", async () => {
      const iter = await fetcher.fetchLatestEventsPerAuthor(
        {
          authors: [pkA, pkB, pkC],
          relayUrls: ["wss://per-author1", "wss://per-author2", "wss://per-author3"],
        },
        {},
        5
      );
      const authors: string[] = [];

      for await (const { author, events } of iter) {
        authors.push(author);

        expect(events.length).toBe(5);

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
        [pkA, ["wss://per-author1", "wss://per-author2"]],
        [pkB, ["wss://per-author2", "wss://per-author3"]],
        [pkC, ["wss://per-author3", "wss://per-author1"]],
      ]);

      const eventsPerAuthor = new Map<string, NostrEvent[]>();

      const iter = await fetcher.fetchLatestEventsPerAuthor(relaySetPerAuthor, {}, 5);
      for await (const { author, events } of iter) {
        eventsPerAuthor.set(author, events);

        expect(events.length).toBe(5);

        // check if events are sorted
        const sorted = events.slice().sort(createdAtDesc);
        expect(events).toStrictEqual(sorted);
      }

      // check if events are fetched from only specified relays for each author
      /* eslint-disable @typescript-eslint/no-non-null-assertion */
      assert(
        eventsPerAuthor
          .get(pkA)!
          .every(({ content }) => content.includes("test1") || content.includes("test2"))
      );
      assert(
        eventsPerAuthor
          .get(pkB)!
          .every(({ content }) => content.includes("test2") || content.includes("test3"))
      );
      assert(
        eventsPerAuthor
          .get(pkC)!
          .every(({ content }) => content.includes("test3") || content.includes("test1"))
      );
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
    });
  });

  describe.concurrent("fetchLastEventPerAuthor", () => {
    const pkA = pubkeyFromAuthorName("alice");
    const pkB = pubkeyFromAuthorName("bob");
    const pkC = pubkeyFromAuthorName("cat");

    test("single relay set for all authors", async () => {
      const iter = await fetcher.fetchLastEventPerAuthor(
        {
          authors: [pkA, pkB, pkC],
          relayUrls: ["wss://per-author1", "wss://per-author2", "wss://per-author3"],
        },
        {}
      );

      const authors: string[] = [];
      for await (const { author, event } of iter) {
        authors.push(author);

        // check if the fetched event is actually the last event
        assert(event !== undefined && event.content.includes("last"));
      }
      // check if we got the last event for all authors
      expect(authors).toEqual(expect.arrayContaining([pkA, pkB, pkC]));
    });

    test("relay set per author", async () => {
      // for each author, only the 2nd-last event can be found
      const relaySetPerAuthor = new Map([
        [pkA, ["wss://per-author1", "wss://per-author2"]],
        [pkB, ["wss://per-author2", "wss://per-author3"]],
        [pkC, ["wss://per-author3", "wss://per-author1"]],
      ]);
      const iter = await fetcher.fetchLastEventPerAuthor(relaySetPerAuthor, {});

      const authors: string[] = [];

      for await (const { author, event } of iter) {
        authors.push(author);

        // check if the fetched event is the 2nd-last event
        assert(event !== undefined && event.content.includes("2nd"));
      }
      // check if we got the last event for all authors
      expect(authors).toEqual(expect.arrayContaining([pkA, pkB, pkC]));
    });
  });
});
