import { Channel } from "@nostr-fetch/kernel/channel";
import { DebugLogger, LogLevel } from "@nostr-fetch/kernel/debugLogger";
import type { FetchTillEoseOptions, NostrFetcherBase } from "@nostr-fetch/kernel/fetcherBase";
import { NostrEvent, generateSubId, type Filter } from "@nostr-fetch/kernel/nostr";
import type {
  RelayEventCbTypes,
  RelayOptions,
  SubEoseCb,
  SubEventCb,
  SubEventCbTypes,
  Subscription,
  SubscriptionOptions,
} from "@nostr-fetch/kernel/relayTypes";
import { emptyAsyncGen, normalizeRelayUrl, normalizeRelayUrls } from "@nostr-fetch/kernel/utils";

import type { SimplePool, Relay as ToolsRelay, Sub as ToolsSub } from "nostr-tools";

class ToolsSubExt {
  #relay: ToolsRelay;
  #subId: string;
  #filters: Filter[];
  #options: SubscriptionOptions;

  #sub: ToolsSub | undefined;

  // records callbacks registered before req()
  #onEvent: Set<SubEventCb> = new Set();
  #onEose: Set<SubEoseCb> = new Set();

  // associates adapted `eose` callbacks with original callbacks
  #onEoseAdapted: Map<SubEoseCb, () => void> = new Map();

  // subscription auto abortion timer
  #abortSubTimer: NodeJS.Timeout | undefined;

  constructor(relay: ToolsRelay, subId: string, filters: Filter[], options: SubscriptionOptions) {
    this.#relay = relay;
    this.#subId = subId;
    this.#filters = filters;
    this.#options = options;
  }

  public get subId(): string {
    return this.#subId;
  }

  public req(): void {
    this.#sub = this.#relay.sub(this.#filters, {
      verb: "REQ",
      skipVerification: this.#options.skipVerification,
      id: this.#subId,
    });

    // initiate subscription auto abortion timer
    this.resetAbortSubTimer();

    // register callbacks which control subscription auto abortion
    this.registerCb("event", () => {
      // reset the auto abortion timer every time a new event arrives
      this.resetAbortSubTimer();
    });
    this.registerCb("eose", () => {
      // clear the auto abortion timer when actual EOSE arrives
      if (this.#abortSubTimer !== undefined) {
        clearTimeout(this.#abortSubTimer);
      }
    });

    // register all callbacks that are registered before `req()`
    for (const cb of this.#onEvent) {
      this.registerCb("event", cb);
    }
    for (const cb of this.#onEose) {
      this.registerCb("eose", cb);
    }
  }

  public close(): void {
    this.#onEoseAdapted.clear();
    this.#sub?.unsub();
  }

  public on<E extends keyof SubEventCbTypes>(type: E, cb: SubEventCbTypes[E]): void {
    if (this.#sub === undefined) {
      this.recordCbBeforeReq(type, cb);
      return;
    }
    this.registerCb(type, cb);
  }

  public off<E extends keyof SubEventCbTypes>(type: E, cb: SubEventCbTypes[E]): void {
    if (this.#sub === undefined) {
      this.forgetCbBeforeReq(type, cb);
      return;
    }
    this.unregisterCb(type, cb);
  }

  // records a callback registered (by `on()`) before `req()`
  private recordCbBeforeReq<E extends keyof SubEventCbTypes>(
    type: E,
    cb: SubEventCbTypes[E]
  ): void {
    switch (type) {
      case "event":
        this.#onEvent.add(cb as SubEventCb);
        break;
      case "eose":
        this.#onEose.add(cb as SubEoseCb);
        break;
    }
  }
  // forgets a callback unregistered (by `off()`) before `req()`
  private forgetCbBeforeReq<E extends keyof SubEventCbTypes>(
    type: E,
    cb: SubEventCbTypes[E]
  ): void {
    switch (type) {
      case "event":
        this.#onEvent.delete(cb as SubEventCb);
        break;
      case "eose":
        this.#onEose.delete(cb as SubEoseCb);
        break;
    }
  }

  // forwards a callback registration to the inner `Sub`
  private registerCb<E extends keyof SubEventCbTypes>(type: E, cb: SubEventCbTypes[E]): void {
    if (this.#sub === undefined) {
      console.error("ToolsSubAdapter: inner Sub is undefined");
      return;
    }

    switch (type) {
      case "event":
        this.#sub.on("event", cb as SubEventCb);
        break;

      case "eose": {
        // adapt callbacks for `eose` events
        // adapted callback will be called when actual EOSE is received, so it should just call the original callback with { aborted: false }.
        const adapted = () => (cb as SubEoseCb)({ aborted: false });
        this.#onEoseAdapted.set(cb as SubEoseCb, adapted);
        this.#sub.on("eose", adapted);
        break;
      }
    }
  }

  // forwards a callback unregistration to the inner `Sub`
  private unregisterCb<E extends keyof SubEventCbTypes>(type: E, cb: SubEventCbTypes[E]): void {
    if (this.#sub === undefined) {
      console.error("ToolsSubAdapter: inner Sub is undefined");
      return;
    }

    switch (type) {
      case "event":
        this.#sub.off("event", cb as SubEventCb);
        break;

      case "eose": {
        const adapted = this.#onEoseAdapted.get(cb as SubEoseCb);
        if (adapted === undefined) {
          return;
        }
        this.#onEoseAdapted.delete(cb as SubEoseCb);
        this.#sub.off("eose", adapted);
        break;
      }
    }
  }

  private resetAbortSubTimer() {
    if (this.#abortSubTimer !== undefined) {
      clearTimeout(this.#abortSubTimer);
      this.#abortSubTimer = undefined;
    }

    this.#abortSubTimer = setTimeout(() => {
      Array.from(this.#onEoseAdapted.keys()).forEach((cb) => cb({ aborted: true }));
    }, this.#options.abortSubBeforeEoseTimeoutMs);
  }
}

class ToolsRelayExt {
  #relayUrl: string;
  #toolsRelay: ToolsRelay;

  constructor(relayUrl: string, toolsRelay: ToolsRelay) {
    this.#relayUrl = relayUrl;
    this.#toolsRelay = toolsRelay;
  }

  public get url(): string {
    return this.#relayUrl;
  }

  public prepareSub(filters: Filter[], options: SubscriptionOptions): Subscription {
    const subId = options.subId ?? generateSubId();
    return new ToolsSubExt(this.#toolsRelay, subId, filters, options);
  }

  public on<E extends keyof RelayEventCbTypes>(type: E, cb: RelayEventCbTypes[E]): void {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    this.#toolsRelay.on(type, cb as any);
  }

  public off<E extends keyof RelayEventCbTypes>(type: E, cb: RelayEventCbTypes[E]): void {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    this.#toolsRelay.off(type, cb as any);
  }
}

// attach timeout to the `promise`
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  msgOnTimeout: string
): Promise<T> => {
  const timeoutAborter = new AbortController();
  const timeout = new Promise<T>((_, reject) => {
    setTimeout(() => reject(Error(msgOnTimeout)), timeoutMs);
    timeoutAborter.signal.addEventListener("abort", () => reject());
  });

  const t = await Promise.race([promise, timeout]);
  timeoutAborter.abort();
  return t;
};

type SimplePoolExtOptions = {
  minLogLevel?: LogLevel;
};

const defaultExtOptions: Required<SimplePoolExtOptions> = {
  minLogLevel: "none",
};

class SimplePoolExt implements NostrFetcherBase {
  #simplePool: SimplePool;

  // storing refs to `ToolsRelayExt`s to allow to take out them synchronously.
  // keys are **normalized** relay URLs.
  #relays: Map<string, ToolsRelayExt> = new Map();

  #debugLogger: DebugLogger | undefined;

  constructor(sp: SimplePool, options: Required<SimplePoolExtOptions>) {
    this.#simplePool = sp;
    if (options.minLogLevel !== "none") {
      this.#debugLogger = new DebugLogger(options.minLogLevel);
    }
  }

  /**
   * Ensures connections to the relays prior to an event subscription.
   *
   * Returns URLs of relays *successfully connected to*.
   *
   * It should *normalize* the passed `relayUrls` before establishing connections to relays.
   */
  public async ensureRelays(
    relayUrls: string[],
    { connectTimeoutMs }: RelayOptions
  ): Promise<string[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);

    const ensure = async (rurl: string) => {
      const logger = this.#debugLogger?.subLogger(rurl);

      const r = await this.#simplePool.ensureRelay(rurl);

      // setup debug log
      r.on("disconnect", () => logger?.log("info", `disconnected`));
      r.on("error", () => logger?.log("error", `WebSocket error`));
      r.on("notice", (notice) => logger?.log("warn", `NOTICE: ${notice}`));
      r.on("auth", () => logger?.log("warn", `received AUTH challange (ignoring)`));

      return new ToolsRelayExt(rurl, r);
    };

    const connectedRelays: string[] = [];
    await Promise.all(
      normalizedUrls.map(async (rurl) => {
        try {
          const r = await withTimeout(
            ensure(rurl),
            connectTimeoutMs,
            `attempt to connect to the relay ${rurl} timed out`
          );

          connectedRelays.push(rurl);
          this.#relays.set(rurl, r);
        } catch (err) {
          console.error(err);
          this.#relays.delete(rurl);
        }
      })
    );
    return connectedRelays;
  }

  private getRelayExtIfConnected(relayUrl: string): ToolsRelayExt | undefined {
    return this.#relays.get(normalizeRelayUrl(relayUrl));
  }

  /**
   * Cleans up all the internal states of the fetcher.
   *
   * It doesn't close any connections to relays, because other codes may reuse them.
   */
  public shutdown(): void {
    // just clear extra refs to `RelayExt`s
    this.#relays.clear();
  }

  /**
   * Fetches Nostr events matching `filters` from the relay specified by `relayUrl` until EOSE.
   *
   * The result is an `AsyncIterable` of Nostr events.
   * You can think that it's an asynchronous channel which conveys events.
   * The channel will be closed once EOSE is reached.
   *
   * If no connection to the specified relay has been established at the time this function is called, it will return an empty channel.
   */
  // TODO: eliminate duplicated code (most of codes overlap with impl of DefaultFetcherBase)
  public fetchTillEose(
    relayUrl: string,
    filters: Filter[],
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const logger = this.#debugLogger?.subLogger(relayUrl);

    const [tx, chIter] = Channel.make<NostrEvent>();

    const relay = this.getRelayExtIfConnected(relayUrl);
    if (relay === undefined) {
      logger?.log("warn", "not connected");
      return emptyAsyncGen();
    }

    // error handlings
    const onNotice = (n: unknown) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));
      removeRelayListeners();
    };
    const onError = () => {
      tx.error(Error("ERROR"));
      removeRelayListeners();
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
      relay.off("error", onError);
    };

    relay.on("notice", onNotice);
    relay.on("error", onError);

    // prepare a subscription
    const sub = relay.prepareSub(filters, options);

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
    });
    sub.on("eose", ({ aborted }) => {
      if (aborted) {
        logger?.log("info", `subscription (id: ${sub.subId}) aborted before EOSE due to timeout`);
      }
      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // handle abortion
    options.abortSignal?.addEventListener("abort", () => {
      logger?.log("info", `subscription (id: ${sub.subId}) aborted via AbortController`);

      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // start the subscription
    sub.req();

    return chIter;
  }
}

/**
 * Wraps a nostr-tools' `SimplePool`, allowing it to interoperate with nostr-fetch.
 *
 * @example
 * ```
 * import { SimplePool } from 'nostr-tools';
 * import { NostrFetcher } from 'nostr-fetch';
 * import { simplePoolAdapter } from '@nostr-fetch/adapter-nostr-tools'
 *
 * const pool = new SimplePool();
 * const fetcher = NostrFetcher.withCustomPool(simplePoolAdapter(pool));
 * ```
 */
export const simplePoolAdapter = (
  pool: SimplePool,
  options: SimplePoolExtOptions = {}
): NostrFetcherBase => {
  const finalOpts = { ...defaultExtOptions, ...options };
  return new SimplePoolExt(pool, finalOpts);
};
