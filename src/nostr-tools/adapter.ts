import type { SimplePool, Relay as ToolsRelay, Sub as ToolsSub } from "nostr-tools";
import { Filter, generateSubId } from "../nostr";
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
} from "../relayTypes";
import { normalizeRelayUrls } from "../utils";

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

    // register all callbacks that are registered before `req()`
    for (const cb of this.#onEvent) {
      this.registerCb("event", cb);
    }
    for (const cb of this.#onEose) {
      this.registerCb("eose", cb);
    }
  }

  public close(): void {
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

  // transfers a callback registration to the inner `Sub`
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
        const adapted = () => (cb as SubEoseCb)({ aborted: false });
        this.#onEoseAdapted.set(cb as SubEoseCb, adapted);
        this.#sub.on("eose", adapted);
        break;
      }
    }
  }

  // transfers a callback unregistration to the inner `Sub`
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

class SimplePoolAdapter implements RelayPoolHandle {
  #simplePool: SimplePool;

  constructor(sp: SimplePool) {
    this.#simplePool = sp;
  }

  public async ensureRelays(relayUrls: string[], _: RelayOptions): Promise<RelayHandle[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls);

    // TODO: timeout
    const ensureResults = await Promise.allSettled(
      normalizedUrls.map((url) =>
        this.#simplePool.ensureRelay(url).then((r) => new ToolsRelayAdapter(url, r))
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
 * Wraps a nostr-tools `SimplePool` to allow it to interoperate with nostr-fetch.
 * @param sp
 * @returns
 */
export const simplePoolAdapter = (sp: SimplePool): RelayPoolHandle => new SimplePoolAdapter(sp);
