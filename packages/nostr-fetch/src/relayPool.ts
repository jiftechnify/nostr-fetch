import type { RelayOptions } from "@nostr-fetch/kernel/relayTypes";
import {
  currUnixtimeMilli,
  normalizeRelayUrl,
  normalizeRelayUrls,
} from "@nostr-fetch/kernel/utils";

import { Deferred } from "@nostr-fetch/kernel/channel";
import { DebugLogger, LogLevel } from "@nostr-fetch/kernel/debugLogger";
import { Relay, initRelay } from "./relay";

export interface RelayPool {
  ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<string[]>;
  getRelayIfConnected(relayUrl: string): Relay | undefined;
  shutdown(): void;
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

const WATCHDOG_INTERVAL = 15 * 1000;
const WATCHDOG_CONN_TIMEOUT = 10 * 1000;

class RelayPoolImpl implements RelayPool {
  // keys are **normalized** relay URLs
  #relays: Map<string, ManagedRelay> = new Map();

  #watchdogTimer: NodeJS.Timer;
  #debugLogger: DebugLogger | undefined;

  constructor(options: Required<RelayPoolOptions>) {
    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }

    // initiate a watchdog timer for relay connections
    this.#watchdogTimer = setInterval(() => {
      this.#debugLogger?.log("info", "watchdog started");

      const rurls = Array.from(this.#relays.keys());
      this.addRelays(rurls, { connectTimeoutMs: WATCHDOG_CONN_TIMEOUT }).then(() => {
        this.#debugLogger?.log("info", "watchdog completed");
      });
    }, WATCHDOG_INTERVAL);
  }

  #relayShouldBeReconnected(relay: ManagedRelay): boolean {
    return (
      // TODO: make the threshold configuarable
      (relay.state === "connectFailed" && currUnixtimeMilli() - relay.failedAt > 60 * 1000) ||
      relay.state === "disconnected" ||
      (relay.state === "alive" && relay.relay.wsReadyState === WebSocket.CLOSED) // is it possible?
    );
  }

  // `relayUrls` should be normalized in advance.
  private async addRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<void> {
    const relaysToConnect: string[] = [];
    const waitsForConnnect: Promise<void>[] = [];

    for (const rurl of relayUrls) {
      const r = this.#relays.get(rurl);
      if (r === undefined || this.#relayShouldBeReconnected(r)) {
        relaysToConnect.push(rurl);
      } else if (r.state === "connecting") {
        waitsForConnnect.push(r.wait);
      }
    }

    await Promise.all([
      ...relaysToConnect.map(async (rurl): Promise<void> => {
        const logger = this.#debugLogger?.subLogger(rurl);

        const deferred = new Deferred<void>();
        try {
          this.#relays.set(rurl, { state: "connecting", relayUrl: rurl, wait: deferred.promise });

          const r = initRelay(rurl, relayOpts);
          r.on("connect", () => logger?.log("info", `connected`));
          r.on("disconnect", (ev) => {
            logger?.log("info", `disconnected: ${JSON.stringify(ev)}`);
            this.#relays.set(r.url, { state: "disconnected", relayUrl: r.url });
          });
          r.on("error", () => {
            logger?.log("error", `WebSocket error`);
            this.#relays.set(r.url, { state: "disconnected", relayUrl: r.url });
          });
          r.on("notice", (notice) => logger?.log("warn", `NOTICE: ${notice}`));

          await r.connect();
          this.#relays.set(rurl, { state: "alive", relayUrl: rurl, relay: r });
        } catch {
          logger?.log("error", "failed to connect to the relay");
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

  public async ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);
    await this.addRelays(normalizedUrls, relayOpts);

    const connectedRelays: string[] = [];
    for (const rurl of normalizedUrls) {
      const r = this.#relays.get(rurl);
      if (r !== undefined && r.state === "alive") {
        connectedRelays.push(r.relay.url);
      }
    }
    return connectedRelays;
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

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * It also closes all the connections to the relays.
   */
  public shutdown() {
    clearInterval(this.#watchdogTimer);

    for (const [, r] of this.#relays) {
      if (r.state === "alive") {
        r.relay.close();
      }
    }
    this.#relays.clear();
  }
}
