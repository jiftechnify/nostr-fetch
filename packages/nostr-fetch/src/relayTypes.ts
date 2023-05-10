import type { Filter, NostrEvent } from "./nostr";

type Callback<E> = E extends void ? () => void : (ev: E) => void;

export type RelayConnectCb = Callback<void>;
export type RelayDisconnectCb = Callback<CloseEvent | undefined>;
export type RelayNoticeCb = Callback<unknown>;
export type RelayErrorCb = Callback<void>;

export type RelayEventCbTypes = {
  connect: RelayConnectCb;
  disconnect: RelayDisconnectCb;
  notice: RelayNoticeCb;
  error: RelayErrorCb;
};

export type RelayEventTypes = keyof RelayEventCbTypes;

type EoseEventPayload = {
  aborted: boolean;
};

export type RelayOptions = {
  connectTimeoutMs: number;
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

// minimum APIs for relay handles that is required to fetch events.
export type RelayHandle = {
  url: string;
  prepareSub(filters: Filter[], options: SubscriptionOptions): Subscription;
  on<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
  off<E extends RelayEventTypes>(type: E, cb: RelayEventCbTypes[E]): void;
};

// minimum APIs for relay pool handles that is required to fetch events.
export type RelayPoolHandle = {
  ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<RelayHandle[]>;
  closeAll(): void;
};
