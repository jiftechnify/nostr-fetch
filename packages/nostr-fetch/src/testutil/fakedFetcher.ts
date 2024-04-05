import { Channel } from "@nostr-fetch/kernel/channel";
import type {
  EnsureRelaysOptions,
  FetchTillEoseOptions,
  NostrFetcherBackend,
  NostrFetcherCommonOptions,
} from "@nostr-fetch/kernel/fetcherBackend";
import { type Filter, type NostrEvent, generateSubId } from "@nostr-fetch/kernel/nostr";
import {
  emptyAsyncGen,
  normalizeRelayUrl,
  normalizeRelayUrlSet,
  withTimeout,
} from "@nostr-fetch/kernel/utils";
import { type FakeEventsSpec, generateFakeEvents } from "@nostr-fetch/testutil/fakeEvent";
import { NostrFetcher } from "../fetcher";
import { type RelayCapabilityChecker, createdAtDesc } from "../fetcherHelper";

import { setTimeout as delay } from "node:timers/promises";

/**
 * Faking NostrFetcherBackend and RelayCapabilityChecker for testing NostrFetcher
 */

export type FakeRelaySpec = {
  eventsSpec: FakeEventsSpec[];
  connectable?: boolean;
  connectDurMs?: number;
  supportedNips?: number[];
  sendEventInterval?: number;
};

const matchEvent = (ev: NostrEvent, f: Filter): boolean => {
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
  if (f.since !== undefined && ev.created_at < f.since) {
    return false;
  }
  if (f.until !== undefined && ev.created_at > f.until) {
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
    }
    return Promise.reject(Error("failed to connect to the relay"));
  }

  req(
    filter: Filter,
    subId: string,
    onEvent: (ev: NostrEvent) => void,
    onEose: () => void,
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
        if (filter.since !== undefined && ev.created_at < filter.since) {
          onEose();
          return;
        }

        if (matchEvent(ev, filter)) {
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

class FakeFetcherBackend implements NostrFetcherBackend {
  #mapFakeRelay: Map<string, FakeRelay> = new Map();

  #calledShutdown = false;

  constructor(relaySpecs: Map<string, FakeRelaySpec>) {
    this.#mapFakeRelay = new Map(
      [...relaySpecs.entries()].map(([rurl, spec]) => [rurl, new FakeRelay(spec)]),
    );
  }

  async ensureRelays(relayUrls: string[], options: EnsureRelaysOptions): Promise<string[]> {
    const connected: string[] = [];
    const normalizedUrls = normalizeRelayUrlSet(relayUrls);
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
      }),
    );
    return connected;
  }

  fetchTillEose(
    relayUrl: string,
    filter: Filter,
    options: FetchTillEoseOptions,
  ): AsyncIterable<NostrEvent> {
    const relay = this.#mapFakeRelay.get(normalizeRelayUrl(relayUrl));
    if (relay === undefined) {
      return emptyAsyncGen();
    }

    const [tx, iter] = Channel.make<NostrEvent>();
    const onEvent = (ev: NostrEvent) => {
      if (options.skipVerification || options.eventVerifier(ev)) {
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
    let subAutoAbortTimer: NodeJS.Timeout | undefined;
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

export class FakedFetcherBuilder {
  #mapFakeRelaySpec: Map<string, FakeRelaySpec> = new Map();

  addRelay(relayUrl: string, spec: FakeRelaySpec): FakedFetcherBuilder {
    this.#mapFakeRelaySpec.set(normalizeRelayUrl(relayUrl), spec);
    return this;
  }

  buildFetcher(opts: NostrFetcherCommonOptions = {}): NostrFetcher {
    const backend = () => new FakeFetcherBackend(this.#mapFakeRelaySpec);
    const capChecker = () => new FakeRelayCapChecker(this.#mapFakeRelaySpec);
    return NostrFetcher.withCustomPool(backend, opts, capChecker);
  }
}
