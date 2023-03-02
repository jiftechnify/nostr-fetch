/* global WebSocket, CloseEvent, MessageEvent */
import {
  C2RMessage,
  Filter,
  generateSubId,
  NostrEvent,
  parseR2CMessage,
  R2CSubMessage,
  validateEvent,
} from "./nostr";

type Callback<E> = E extends void ? () => void : (ev: E) => void;

type RelayConnectCb = Callback<void>;
type RelayDisconnectCb = Callback<CloseEvent>;
type RelayNoticeCb = Callback<unknown>;
type RelayErrorCb = Callback<void>;

type RelayEventCbTypes = {
  connect: RelayConnectCb;
  disconnect: RelayDisconnectCb;
  notice: RelayNoticeCb;
  error: RelayErrorCb;
};

type RelayEventTypes = keyof RelayEventCbTypes;

type SubEventCb = Callback<NostrEvent>;
type SubEoseCb = Callback<void>;

type SubEventCbTypes = {
  event: SubEventCb;
  eose: SubEoseCb;
};

type SubEventTypes = keyof SubEventCbTypes;

export type RelayOptions = {
  skipVerification: boolean;
  connectTimeoutMs: number;
  autoEoseTimeoutMs: number;
};

export interface Relay {
  url: string;
  connect(): Promise<void>;
  close(): void;
  prepareSub(filters: Filter[]): Subscription;

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

  #subscriptions: Map<string, SubscriptionImpl> = new Map();

  #msgQueue: string[] = [];
  #handleMsgsInterval: NodeJS.Timer | undefined;

  constructor(relayUrl: string, options: RelayOptions) {
    this.#relayUrl = relayUrl;
    this.#options = options;
  }

  public get url(): string {
    return this.#relayUrl;
  }

  private forwardSubMsg(subId: string, msg: R2CSubMessage) {
    const targSub = this.#subscriptions.get(subId);
    if (targSub !== undefined) {
      targSub._forwardSubMsg(msg);
    }
  }

  private handleMsgs() {
    if (this.#msgQueue.length === 0) {
      clearInterval(this.#handleMsgsInterval);
      this.#handleMsgsInterval = undefined;
      return;
    }

    const dispatchStartedAt = performance.now();

    while (
      this.#msgQueue.length > 0 &&
      performance.now() - dispatchStartedAt < 5.0
    ) {
      const rawMsg = this.#msgQueue.shift() as string;
      const parsed = parseR2CMessage(rawMsg, this.#options.skipVerification);
      if (parsed === undefined) {
        continue;
      }

      switch (parsed[0]) {
        case "EVENT": {
          const [, subId, ev] = parsed;
          if (!validateEvent(ev)) {
            break;
          }
          this.forwardSubMsg(subId, parsed);
          break;
        }
        case "EOSE": {
          const [, subId] = parsed;
          this.forwardSubMsg(subId, parsed);
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

  public async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isTimedout = false;
      const timeout = setTimeout(() => {
        isTimedout = true;
        reject(
          Error(`attempt to connect to the relay '${this.#relayUrl}' timed out`)
        );
      }, this.#options.connectTimeoutMs);

      const ws = new WebSocket(this.#relayUrl);

      ws.onopen = () => {
        if (!isTimedout) {
          console.log("open");
          this.#onConnect.forEach((cb) => cb());
          this.#ws = ws;
          resolve();

          clearTimeout(timeout);
        }
      };

      ws.onerror = () => {
        this.#onError.forEach((cb) => cb());
        reject(Error("WebSocket error"));
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

  public prepareSub(filters: Filter[]): Subscription {
    if (this.#ws === undefined) {
      throw Error("not connected to the relay");
    }

    const subId = generateSubId();
    const sub = new SubscriptionImpl(
      this,
      subId,
      filters,
      this.#options.autoEoseTimeoutMs
    );
    this.#subscriptions.set(subId, sub);

    return sub;
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

export interface Subscription {
  req(): void;
  close(): void;
  on<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]): void;
  off<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]): void;
}

class SubscriptionImpl implements Subscription {
  #relay: RelayImpl;
  #subId: string;
  #filters: Filter[];

  #onEvent: Set<Callback<NostrEvent>> = new Set();
  #onEose: Set<Callback<void>> = new Set();

  #autoEoseTimeout: NodeJS.Timeout | undefined;
  #autoEoseTimeoutMs: number;

  constructor(
    relay: RelayImpl,
    subId: string,
    filters: Filter[],
    autoEoseTimeoutMs: number
  ) {
    this.#relay = relay;
    this.#subId = subId;
    this.#filters = filters;
    this.#autoEoseTimeoutMs = autoEoseTimeoutMs;
  }

  public req() {
    console.log("req", this.#subId);

    this.#relay._sendC2RMessage(["REQ", this.#subId, ...this.#filters]);
    this.resetAutoEoseTimeout();
  }

  public close() {
    console.log("close", this.#subId);
    this.clearListeners();

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

  private resetAutoEoseTimeout() {
    if (this.#autoEoseTimeout !== undefined) {
      clearTimeout(this.#autoEoseTimeout);
      this.#autoEoseTimeout = undefined;
    }

    this.#autoEoseTimeout = setTimeout(() => {
      this.#onEose.forEach((cb) => cb());
    }, this.#autoEoseTimeoutMs);
  }

  _forwardSubMsg(msg: R2CSubMessage) {
    switch (msg[0]) {
      case "EVENT":
        this.#onEvent.forEach((cb) => cb(msg[2]));
        this.resetAutoEoseTimeout();
        break;

      case "EOSE":
        this.#onEose.forEach((cb) => cb());
        if (this.#autoEoseTimeout !== undefined) {
          clearTimeout(this.#autoEoseTimeout);
        }
        break;
    }
  }
}
