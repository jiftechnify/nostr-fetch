/* global WebSocket, CloseEvent, MessageEvent */
import {
  C2RMessage,
  Filter,
  generateSubId,
  NostrEvent,
  parseR2CMessage,
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

type SubEventCb = Callback<NostrEvent[]>;
type SubEoseCb = Callback<void>;

type SubEventCbTypes = {
  event: SubEventCb;
  eose: SubEoseCb;
};

type SubEventTypes = keyof SubEventCbTypes;

type RelaySubListeners = {
  event: Set<SubEventCb>;
  eose: Set<SubEoseCb>;
};

export type RelayOptions = {
  verifyEventSig?: boolean;
};

const defaultRelayOptions: Required<RelayOptions> = {
  verifyEventSig: true,
};

export class Relay {
  #relayUrl: string;
  #ws: WebSocket | undefined;

  #options: Required<RelayOptions>;

  #onConnect: Set<RelayConnectCb> = new Set();
  #onDisconnect: Set<RelayDisconnectCb> = new Set();
  #onNotice: Set<RelayNoticeCb> = new Set();
  #onError: Set<RelayErrorCb> = new Set();

  #subListeners: Map<string, RelaySubListeners> = new Map();

  #msgQueue: string[] = [];
  #handleMsgsInterval: NodeJS.Timer | undefined;

  public constructor(relayUrl: string, options: RelayOptions = {}) {
    this.#relayUrl = relayUrl;
    this.#options = { ...defaultRelayOptions, ...options };
  }

  public get url(): string {
    return this.#relayUrl;
  }

  private handleMsgs() {
    if (this.#msgQueue.length === 0) {
      clearInterval(this.#handleMsgsInterval);
      this.#handleMsgsInterval = undefined;
      return;
    }

    const evsPerSub: Map<string, NostrEvent[]> = new Map();
    const eoseSubs: Set<string> = new Set();

    const dispatchStartedAt = performance.now();

    while (
      this.#msgQueue.length > 0 &&
      performance.now() - dispatchStartedAt < 5.0
    ) {
      const rawMsg = this.#msgQueue.shift() as string;
      const parsed = parseR2CMessage(rawMsg, this.#options.verifyEventSig);
      if (parsed === undefined) {
        continue;
      }

      switch (parsed[0]) {
        case "EVENT": {
          const [, subId, ev] = parsed;
          if (!validateEvent(ev)) {
            break;
          }

          const prev = evsPerSub.get(subId);
          if (prev === undefined) {
            evsPerSub.set(subId, [ev]);
          } else {
            prev.push(ev);
          }
          break;
        }
        case "EOSE": {
          const [, subId] = parsed;
          eoseSubs.add(subId);
          break;
        }
        case "NOTICE": {
          const [, notice] = parsed;
          this.#onNotice.forEach((cb) => cb(notice));
          break;
        }
      }
    }
    this.#subListeners.forEach((subLs, subId) => {
      const evs = evsPerSub.get(subId);
      if (evs !== undefined) {
        subLs.event.forEach((cb) => cb(evs));
      }

      if (eoseSubs.has(subId)) {
        subLs.eose.forEach((cb) => cb());
      }
    });
  }

  public async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.#relayUrl);

      ws.onopen = () => {
        this.#onConnect.forEach((cb) => cb());
        this.#ws = ws;
        resolve();
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
    return new Subscription(this, filters);
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

  sendMessage(msg: C2RMessage) {
    const jstr = JSON.stringify(msg);
    // TODO: check WS connection status
    if (this.#ws === undefined) {
      throw Error("not connected to relay");
    }
    this.#ws.send(jstr);
  }

  addSubListener<E extends SubEventTypes>(
    subId: string,
    type: E,
    cb: SubEventCbTypes[E]
  ) {
    const ls = this.#subListeners.get(subId) ?? {
      event: new Set(),
      eose: new Set(),
    };

    switch (type) {
      case "event":
        ls.event.add(cb as SubEventCb);
        break;

      case "eose":
        ls.eose.add(cb as SubEoseCb);
        break;
    }

    this.#subListeners.set(subId, ls);
  }

  clearSubListeners(subId: string) {
    this.#subListeners.delete(subId);
  }
}

export class Subscription {
  #relay: Relay;
  #subId: string;
  #filters: Filter[];

  constructor(relay: Relay, filters: Filter[]) {
    this.#relay = relay;
    this.#subId = generateSubId();
    this.#filters = filters;
  }

  public on<E extends SubEventTypes>(type: E, cb: SubEventCbTypes[E]) {
    switch (type) {
      case "event":
        this.#relay.addSubListener(this.#subId, "event", cb as SubEventCb);
        return;

      case "eose":
        this.#relay.addSubListener(this.#subId, "eose", cb as SubEoseCb);
        return;
    }
  }

  public req() {
    this.#relay.sendMessage(["REQ", this.#subId, ...this.#filters]);
  }

  public close() {
    this.#relay.clearSubListeners(this.#subId);
    this.#relay.sendMessage(["CLOSE", this.#subId]);
  }
}
