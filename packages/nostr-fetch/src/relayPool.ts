import type { Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { generateSubId } from "@nostr-fetch/kernel/nostr";
import type {
  RelayOptions,
  SubEoseCb,
  SubEventCb,
  SubEventCbTypes,
  SubEventTypes,
  Subscription,
  SubscriptionOptions,
} from "@nostr-fetch/kernel/relayTypes";
import {
  currUnixtimeMilli,
  normalizeRelayUrl,
  normalizeRelayUrls,
} from "@nostr-fetch/kernel/utils";

import { DebugLogger, LogLevel } from "@nostr-fetch/kernel/debugLogger";
import { Relay, initRelay } from "./relay";

export interface RelayPool {
  ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<Relay[]>;
  getRelayIfConnected(relayUrl: string): Relay | undefined;
  shutdown(): void;

  // prepareSub(
  //   relayUrls: string[],
  //   filters: Filter[],
  //   opts: RelayOptions & SubscriptionOptions
  // ): Promise<Subscription>;

  // on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
  // off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
}

export type RelayPoolOptions = {
  minLogLevel: LogLevel;
};

export const initRelayPool = (opts: RelayPoolOptions): RelayPool => {
  return new RelayPoolImpl(opts);
};

type AliveRelay = {
  state: "alive";
  relayUrl: string;
  relay: Relay;
};
type ConnectingRelay = {
  state: "connecting";
  relayUrl: string;
  wait: Promise<void>;
};
type ConnectFailedRelay = {
  state: "connectFailed";
  relayUrl: string;
  failedAt: number; // unixtime(ms)
};
type DisconnectedRelay = {
  state: "disconnected";
  relayUrl: string;
};
type ManagedRelay = AliveRelay | ConnectingRelay | ConnectFailedRelay | DisconnectedRelay;

class RelayPoolImpl implements RelayPool {
  // keys are **normalized** relay URLs
  #relays: Map<string, ManagedRelay> = new Map();
  #debugLogger: DebugLogger | undefined;

  constructor(options: Required<RelayPoolOptions>) {
    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }
  }

  private relayShouldBeReconnected(relay: ManagedRelay): boolean {
    return (
      // TODO: make the threshold configuarable
      (relay.state === "connectFailed" && currUnixtimeMilli() - relay.failedAt > 60 * 1000) ||
      relay.state === "disconnected"
    );
  }

  // `relayUrls` should be normalized in advance.
  private async addRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<void> {
    const relaysToConnect: string[] = [];
    const waitsForConnnect: Promise<void>[] = [];

    for (const rurl of relayUrls) {
      const r = this.#relays.get(rurl);
      if (r === undefined || this.relayShouldBeReconnected(r)) {
        relaysToConnect.push(rurl);
      } else if (r.state === "connecting") {
        waitsForConnnect.push(r.wait);
      }
    }

    await Promise.all([
      ...relaysToConnect.map(async (rurl): Promise<void> => {
        const deferred = new VoidDeferred();
        try {
          this.#relays.set(rurl, { state: "connecting", relayUrl: rurl, wait: deferred.promise });

          const r = initRelay(rurl, relayOpts);
          r.on("connect", () => this.#debugLogger?.log("info", `[${rurl}] connected`));
          r.on("disconnect", (ev) => {
            this.#debugLogger?.log("info", `[${rurl}] disconnected: ${JSON.stringify(ev)}`);
            this.#relays.set(r.url, { state: "disconnected", relayUrl: r.url });
          });
          r.on("error", () => {
            this.#debugLogger?.log("error", `[${rurl}] WebSocket error`);
            this.#relays.set(r.url, { state: "disconnected", relayUrl: r.url });
          });
          r.on("notice", (notice) => this.#debugLogger?.log("warn", `[${rurl}] NOTICE: ${notice}`));

          await r.connect();
          this.#relays.set(rurl, { state: "alive", relayUrl: rurl, relay: r });
        } catch {
          console.error(`failed to connect to the relay '${rurl}'`);
          this.#relays.set(rurl, {
            state: "connectFailed",
            relayUrl: rurl,
            failedAt: currUnixtimeMilli(),
          });
        } finally {
          deferred.resolve();
        }
      }),
      ...waitsForConnnect,
    ]);
  }

  public async ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<Relay[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);
    await this.addRelays(normalizedUrls, relayOpts);

    const res: Relay[] = [];
    for (const rurl of normalizedUrls) {
      const r = this.#relays.get(rurl);
      if (r !== undefined && r.state === "alive") {
        res.push(r.relay);
      }
    }
    return res;
  }

  public getRelayIfConnected(relayUrl: string): Relay | undefined {
    const r = this.#relays.get(normalizeRelayUrl(relayUrl));
    if (r === undefined) {
      return undefined;
    }
    if (r.state !== "alive") {
      return undefined;
    }
    return r.relay;
  }

  public async prepareSub(
    relayUrls: string[],
    filters: Filter[],
    opts: RelayOptions & SubscriptionOptions
  ): Promise<Subscription> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);
    await this.addRelays(normalizedUrls, opts);

    const subId = generateSubId();
    const subs = new Map<string, Subscription>();

    for (const rurl of normalizedUrls) {
      const r = this.#relays.get(rurl);
      if (r !== undefined && r.state === "alive") {
        const rsub = r.relay.prepareSub(filters, { ...opts, subId });
        subs.set(rurl, rsub);
      }
    }
    if (subs.size === 0) {
      throw Error("no relays are available");
    }

    this.#debugLogger?.log("verbose", `subId: ${subId}, make sub to: ${Array.from(subs.keys())}`);
    return new RelayPoolSubscription(subId, subs);
  }

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * It also closes all the connections to the relays.
   */
  public shutdown() {
    for (const [, r] of this.#relays) {
      if (r.state === "alive") {
        r.relay.close();
      }
    }
    this.#relays.clear();
  }
}

// not used so far.  maybe completely useless...?
class RelayPoolSubscription implements Subscription {
  #subId: string;
  #relaySubs: Map<string, Subscription>;

  #onEvent: Set<SubEventCb> = new Set();
  #onEose: Set<SubEoseCb> = new Set();

  #seenEventIds: Set<string> = new Set();
  #eoseRelays: Set<string> = new Set();

  constructor(subId: string, relaySubs: Map<string, Subscription>) {
    this.#subId = subId;
    this.#relaySubs = relaySubs;
  }

  public get subId(): string {
    return this.#subId;
  }

  public req() {
    for (const [rurl, rsub] of this.#relaySubs.entries()) {
      rsub.on("event", (ev: NostrEvent) => {
        // eliminate duplicated events
        if (!this.#seenEventIds.has(ev.id)) {
          this.#onEvent.forEach((cb) => cb(ev));
          this.#seenEventIds.add(ev.id);
        }
      });
      rsub.on("eose", () => {
        this.#eoseRelays.add(rurl);
        // fire EOSE callbacks at the moment when all relays have reached EOSE.
        if (this.#eoseRelays.size === this.#relaySubs.size) {
          this.#onEose.forEach((cb) => cb({ aborted: false })); // TODO
        }
      });

      // TODO: error handling?
      rsub.req();
    }
  }

  public close() {
    this.clearListeners();

    for (const relaySub of this.#relaySubs.values()) {
      relaySub.close();
    }
  }

  public on<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]) {
    switch (type) {
      case "event":
        this.#onEvent.add(cb as SubEventCb);
        return;

      case "eose":
        this.#onEose.add(cb as SubEoseCb);
        return;
    }
  }

  public off<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]) {
    switch (type) {
      case "event":
        this.#onEvent.delete(cb as SubEventCb);
        return;

      case "eose":
        this.#onEose.delete(cb as SubEoseCb);
        return;
    }
  }

  private clearListeners() {
    this.#onEvent.clear();
    this.#onEose.clear();
  }
}

interface VoidDeferred {
  resolve(): void;
}

class VoidDeferred {
  promise: Promise<void>;
  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = () => {
        resolve();
      };
    });
  }
}
