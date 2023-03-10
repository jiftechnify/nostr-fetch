import type { NostrEvent } from "./nostr";

type Callback<E> = E extends void ? () => void : (ev: E) => void;

export type RelayConnectCb = Callback<void>;
export type RelayDisconnectCb = Callback<CloseEvent>;
export type RelayNoticeCb = Callback<unknown>;
export type RelayErrorCb = Callback<void>;

export type RelayEventCbTypes = {
  connect: RelayConnectCb;
  disconnect: RelayDisconnectCb;
  notice: RelayNoticeCb;
  error: RelayErrorCb;
};

export type RelayEventTypes = keyof RelayEventCbTypes;

export type SubEventCb = Callback<NostrEvent>;
export type SubEoseCb = Callback<void>;

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
  autoEoseTimeoutMs: number;
}
