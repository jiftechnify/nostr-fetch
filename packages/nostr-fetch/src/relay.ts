import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import type { C2RMessage, Filter, NostrEvent } from "@nostr-fetch/kernel/nostr";
import { generateSubId, parseR2CMessage } from "@nostr-fetch/kernel/nostr";
import { WebSocketReadyState } from "@nostr-fetch/kernel/webSocket";

type Callback<E> = E extends void ? () => void : (ev: E) => void;

export interface Relay {
  url: string;
  wsReadyState: number;

  connect(): Promise<Relay>;
  close(): void;
  prepareSub(filters: Filter[], options: SubscriptionOptions): Subscription;

  on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
  off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
}

export type RelayOptions = {
  connectTimeoutMs: number;
};

export const initRelay = (relayUrl: string, options: RelayOptions): Relay => {
  return new RelayImpl(relayUrl, options);
};

export type WSCloseEvent = {
  code: number;
  reason: string;
  wasClean: boolean | undefined; // optional since websocket-polyfill's CloseEvent doesn't have it
};

export type RelayConnectCb = Callback<void>;
export type RelayDisconnectCb = Callback<WSCloseEvent | undefined>;
export type RelayNoticeCb = Callback<string>;
export type RelayErrorCb = Callback<void>;

export type RelayEventCbTypes = {
  connect: RelayConnectCb;
  disconnect: RelayDisconnectCb;
  notice: RelayNoticeCb;
  error: RelayErrorCb;
};

export type RelayEventTypes = keyof RelayEventCbTypes;

type RelayListenersTable = {
  [E in RelayEventTypes]: Set<RelayEventCbTypes[E]>;
};

class RelayImpl implements Relay {
  #relayUrl: string;
  #ws: WebSocket | undefined;

  #options: Required<RelayOptions>;

  #listeners: RelayListenersTable = {
    connect: new Set(),
    disconnect: new Set(),
    notice: new Set(),
    error: new Set(),
  };
  #subscriptions: Map<string, RelaySubscription> = new Map();

  #msgQueue: string[] = [];
  #handleMsgsInterval: NodeJS.Timeout | undefined;

  constructor(relayUrl: string, options: RelayOptions) {
    this.#relayUrl = relayUrl;
    this.#options = options;
  }

  public get url(): string {
    return this.#relayUrl;
  }

  public get wsReadyState(): number {
    return this.#ws?.readyState ?? WebSocketReadyState.CONNECTING;
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
          this.#listeners.notice.forEach((cb) => cb(notice));
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
          this.#listeners.connect.forEach((cb) => cb());
          this.#ws = ws;

          // set error listeners after the connection opened successfully
          ws.onerror = () => {
            this.#listeners.error.forEach((cb) => cb());
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

      ws.onclose = (e: WSCloseEvent) => {
        const reducted = {
          code: e.code,
          reason: e.reason,
          wasClean: e.wasClean,
        };
        this.#listeners.disconnect.forEach((cb) => cb(reducted));
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
    const subId = options.subId ?? generateSubId();
    const sub = new RelaySubscription(this, subId, filters, options);
    this.#subscriptions.set(subId, sub);

    return sub;
  }

  _removeSub(subId: string) {
    this.#subscriptions.delete(subId);
  }

  public on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]) {
    this.#listeners[type].add(cb);
  }

  public off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]) {
    this.#listeners[type].delete(cb);
  }

  _sendC2RMessage(msg: C2RMessage) {
    if (this.#ws === undefined || this.#ws.readyState !== WebSocketReadyState.OPEN) {
      throw Error("not connected to the relay");
    }
    this.#ws.send(JSON.stringify(msg));
  }
}

type EoseEventPayload = {
  aborted: boolean;
};

export type SubEventCb = Callback<NostrEvent>;
export type SubEoseCb = Callback<EoseEventPayload>;

export type SubEventCbTypes = {
  event: SubEventCb;
  eose: SubEoseCb;
};

export type SubEventTypes = keyof SubEventCbTypes;

export interface Subscription {
  subId: string;
  req(): void;
  close(): void;
  on<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]): void;
  off<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]): void;
}

export interface SubscriptionOptions {
  subId?: string;
  skipVerification: boolean;
  abortSubBeforeEoseTimeoutMs: number;
}

type SubListenersTable = {
  [E in SubEventTypes]: Set<SubEventCbTypes[E]>;
};

class RelaySubscription implements Subscription {
  #relay: RelayImpl;
  #subId: string;
  #filters: Filter[];
  #options: SubscriptionOptions;

  #listeners: SubListenersTable = {
    event: new Set(),
    eose: new Set(),
  };

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
    this.#resetAbortSubTimer();
  }

  public close() {
    this.#clearListeners();
    this.#relay._removeSub(this.#subId);

    this.#relay._sendC2RMessage(["CLOSE", this.#subId]);
  }

  public on<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]) {
    this.#listeners[type].add(cb);
  }

  public off<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]) {
    this.#listeners[type].delete(cb);
  }

  #clearListeners() {
    for (const s of Object.values(this.#listeners)) {
      s.clear();
    }
  }

  #resetAbortSubTimer() {
    if (this.#abortSubTimer !== undefined) {
      clearTimeout(this.#abortSubTimer);
      this.#abortSubTimer = undefined;
    }

    this.#abortSubTimer = setTimeout(() => {
      this.#listeners.eose.forEach((cb) => cb({ aborted: true }));
    }, this.#options.abortSubBeforeEoseTimeoutMs);
  }

  _forwardEvent(ev: NostrEvent) {
    this.#resetAbortSubTimer();

    if (!this.#options.skipVerification && !verifyEventSig(ev)) {
      return;
    }
    this.#listeners.event.forEach((cb) => cb(ev));
  }

  _forwardEose() {
    if (this.#abortSubTimer !== undefined) {
      clearTimeout(this.#abortSubTimer);
    }
    this.#listeners.eose.forEach((cb) => cb({ aborted: false }));
  }
}
