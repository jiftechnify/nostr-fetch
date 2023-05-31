/* global WebSocket, CloseEvent, MessageEvent */
import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import type { C2RMessage, Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { generateSubId, parseR2CMessage } from "@nostr-fetch/kernel/nostr";
import type {
  RelayConnectCb,
  RelayDisconnectCb,
  RelayErrorCb,
  RelayEventCbTypes,
  RelayEventTypes,
  RelayNoticeCb,
  RelayOptions,
  SubEoseCb,
  SubEventCb,
  SubEventCbTypes,
  SubEventTypes,
  Subscription,
  SubscriptionOptions,
} from "@nostr-fetch/kernel/relayTypes";

export interface Relay {
  url: string;
  connect(): Promise<Relay>;
  close(): void;
  prepareSub(filters: Filter[], options: SubscriptionOptions): Subscription;

  on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
  off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
}

export const initRelay = (relayUrl: string, options: RelayOptions): Relay => {
  return new RelayImpl(relayUrl, options);
};

class RelayImpl implements Relay {
  #relayUrl: string;
  #ws: WebSocket | undefined;

  #options: Required<RelayOptions>;

  #onConnect: Set<RelayConnectCb> = new Set();
  #onDisconnect: Set<RelayDisconnectCb> = new Set();
  #onNotice: Set<RelayNoticeCb> = new Set();
  #onError: Set<RelayErrorCb> = new Set();

  #subscriptions: Map<string, RelaySubscription> = new Map();

  #msgQueue: string[] = [];
  #handleMsgsInterval: NodeJS.Timer | undefined;

  constructor(relayUrl: string, options: RelayOptions) {
    this.#relayUrl = relayUrl;
    this.#options = options;
  }

  public get url(): string {
    return this.#relayUrl;
  }

  private forwardToSub(subId: string, forwardFn: (sub: RelaySubscription) => void) {
    const targSub = this.#subscriptions.get(subId);
    if (targSub !== undefined) {
      forwardFn(targSub);
    }
  }

  private handleMsgs() {
    if (this.#msgQueue.length === 0) {
      clearInterval(this.#handleMsgsInterval);
      this.#handleMsgsInterval = undefined;
      return;
    }

    const dispatchStartedAt = performance.now();

    while (this.#msgQueue.length > 0 && performance.now() - dispatchStartedAt < 5.0) {
      const rawMsg = this.#msgQueue.shift() as string;
      const parsed = parseR2CMessage(rawMsg);
      if (parsed === undefined) {
        continue;
      }

      switch (parsed[0]) {
        case "EVENT": {
          const [, subId, ev] = parsed;
          this.forwardToSub(subId, (sub) => sub._forwardEvent(ev));
          break;
        }
        case "EOSE": {
          const [, subId] = parsed;
          this.forwardToSub(subId, (sub) => sub._forwardEose());
          break;
        }
        case "NOTICE": {
          const [, notice] = parsed;
          this.#onNotice.forEach((cb) => cb(notice));
          break;
        }
      }
    }
  }

  public async connect(): Promise<Relay> {
    return new Promise<Relay>((resolve, reject) => {
      let isTimedout = false;
      const timeout = setTimeout(() => {
        isTimedout = true;
        reject(Error(`attempt to connect to the relay '${this.#relayUrl}' timed out`));
      }, this.#options.connectTimeoutMs);

      const ws = new WebSocket(this.#relayUrl);

      ws.onopen = () => {
        if (!isTimedout) {
          this.#onConnect.forEach((cb) => cb());
          this.#ws = ws;

          // set error listeners after the connection opened successfully
          ws.onerror = () => {
            this.#onError.forEach((cb) => cb());
          };

          resolve(this);

          clearTimeout(timeout);
        }
      };

      // error listeners are *not* activated while attempt to connect is in progress
      ws.onerror = () => {
        reject(Error("WebSocket error"));

        clearTimeout(timeout);
      };

      ws.onclose = (e: CloseEvent) => {
        this.#onDisconnect.forEach((cb) => cb(e));
      };

      ws.onmessage = (e: MessageEvent) => {
        this.#msgQueue.push(e.data);
        if (this.#handleMsgsInterval === undefined) {
          this.#handleMsgsInterval = setInterval(() => this.handleMsgs(), 0);
        }
      };
    });
  }

  public close() {
    if (this.#ws !== undefined) {
      this.#ws.close();
    }
  }

  public prepareSub(filters: Filter[], options: SubscriptionOptions): Subscription {
    if (this.#ws === undefined) {
      throw Error("not connected to the relay");
    }

    const subId = options.subId ?? generateSubId();
    const sub = new RelaySubscription(this, subId, filters, options);
    this.#subscriptions.set(subId, sub);

    return sub;
  }

  _removeSub(subId: string) {
    this.#subscriptions.delete(subId);
  }

  public on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]) {
    switch (type) {
      case "connect":
        this.#onConnect.add(cb as RelayConnectCb);
        return;

      case "disconnect":
        this.#onDisconnect.add(cb as RelayDisconnectCb);
        return;

      case "notice":
        this.#onNotice.add(cb as RelayNoticeCb);
        return;

      case "error":
        this.#onError.add(cb as RelayErrorCb);
        return;
    }
  }

  public off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]) {
    switch (type) {
      case "connect":
        this.#onConnect.delete(cb as RelayConnectCb);
        return;

      case "disconnect":
        this.#onDisconnect.delete(cb as RelayDisconnectCb);
        return;

      case "notice":
        this.#onNotice.delete(cb as RelayNoticeCb);
        return;

      case "error":
        this.#onError.delete(cb as RelayErrorCb);
        return;
    }
  }

  _sendC2RMessage(msg: C2RMessage) {
    const jstr = JSON.stringify(msg);
    // TODO: check WS connection status
    if (this.#ws === undefined) {
      throw Error("not connected to relay");
    }
    this.#ws.send(jstr);
  }
}

class RelaySubscription implements Subscription {
  #relay: RelayImpl;
  #subId: string;
  #filters: Filter[];
  #options: SubscriptionOptions;

  #onEvent: Set<SubEventCb> = new Set();
  #onEose: Set<SubEoseCb> = new Set();

  #abortSubTimer: NodeJS.Timeout | undefined;

  constructor(relay: RelayImpl, subId: string, filters: Filter[], options: SubscriptionOptions) {
    this.#relay = relay;
    this.#subId = subId;
    this.#filters = filters;
    this.#options = options;
  }

  public get subId(): string {
    return this.#subId;
  }

  public req() {
    this.#relay._sendC2RMessage(["REQ", this.#subId, ...this.#filters]);
    this.resetAbortSubTimer();
  }

  public close() {
    this.clearListeners();
    this.#relay._removeSub(this.#subId);

    this.#relay._sendC2RMessage(["CLOSE", this.#subId]);
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

  private resetAbortSubTimer() {
    if (this.#abortSubTimer !== undefined) {
      clearTimeout(this.#abortSubTimer);
      this.#abortSubTimer = undefined;
    }

    this.#abortSubTimer = setTimeout(() => {
      this.#onEose.forEach((cb) => cb({ aborted: true }));
    }, this.#options.abortSubBeforeEoseTimeoutMs);
  }

  _forwardEvent(ev: NostrEvent) {
    this.resetAbortSubTimer();

    if (!this.#options.skipVerification && !verifyEventSig(ev)) {
      return;
    }
    this.#onEvent.forEach((cb) => cb(ev));
  }

  _forwardEose() {
    if (this.#abortSubTimer !== undefined) {
      clearTimeout(this.#abortSubTimer);
    }
    this.#onEose.forEach((cb) => cb({ aborted: false }));
  }
}
