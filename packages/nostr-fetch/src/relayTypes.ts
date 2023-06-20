import type { NostrEvent } from "@nostr-fetch/kernel/nostr";

type Callback<E> = E extends void ? () => void : (ev: E) => void;

export type WSCloseEvent = {
  code: number;
  reason: string;
  wasClean: boolean | undefined; // optional since websocket-polyfill's CloseEvent doesn't have it
};

export type RelayConnectCb = Callback<void>;
export type RelayDisconnectCb = Callback<WSCloseEvent | undefined>;
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
