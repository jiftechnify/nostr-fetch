import { Filter, generateSubId } from "nostr-fetch/src/nostr";
import type {
  RelayEventCbTypes,
  RelayHandle,
  RelayOptions,
  RelayPoolHandle,
  SubEoseCb,
  SubEventCb,
  SubEventCbTypes,
  Subscription,
  SubscriptionOptions,
} from "nostr-fetch/src/relayTypes";
import { normalizeRelayUrls } from "nostr-fetch/src/utils";
import type { SimplePool, Relay as ToolsRelay, Sub as ToolsSub } from "nostr-tools";

class ToolsSubAdapter implements Subscription {
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

class ToolsRelayAdapter implements RelayHandle {
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
    return new ToolsSubAdapter(this.#toolsRelay, subId, filters, options);
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

type AdapterOptions = {
  enableDebugLog?: boolean;
};

const defaultAdapterOptions: Required<AdapterOptions> = {
  enableDebugLog: false,
};

class SimplePoolAdapter implements RelayPoolHandle {
  #simplePool: SimplePool;

  #logForDebug: typeof console.log | undefined;

  constructor(sp: SimplePool, options: Required<AdapterOptions>) {
    this.#simplePool = sp;
    if (options.enableDebugLog) {
      this.#logForDebug = console.log;
    }
  }

  public async ensureRelays(
    relayUrls: string[],
    { connectTimeoutMs }: RelayOptions
  ): Promise<RelayHandle[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);

    const ensureResults = await Promise.allSettled(
      normalizedUrls.map((url) =>
        withTimeout(
          this.#simplePool.ensureRelay(url).then((r) => {
            // setup debug log
            r.on("disconnect", () => this.#logForDebug?.(`[${url}] disconnected`));
            r.on("error", () => this.#logForDebug?.(`[${url}] WebSocket error`));
            r.on("notice", (notice) => this.#logForDebug?.(`[${url}] NOTICE: ${notice}`));
            r.on("auth", () => this.#logForDebug?.(`[${url}] received AUTH challange (ignoring)`));

            return new ToolsRelayAdapter(url, r);
          }),
          connectTimeoutMs,
          `attempt to connect to the relay ${url} timed out`
        )
      )
    );

    const relays: RelayHandle[] = [];
    for (const res of ensureResults) {
      switch (res.status) {
        case "fulfilled":
          relays.push(res.value);
          break;
        case "rejected":
          console.error(res.reason);
          break;
      }
    }

    return relays;
  }

  public closeAll(): void {
    // closes nothing: connections to relays can be used in other places
  }
}

/**
 * Wraps a nostr-tools' `SimplePool`, allowing it to interoperate with nostr-fetch.
 */
export const simplePoolAdapter = (
  sp: SimplePool,
  options: AdapterOptions = {}
): RelayPoolHandle => {
  const finalOpts = { ...defaultAdapterOptions, ...options };
  return new SimplePoolAdapter(sp, finalOpts);
};
