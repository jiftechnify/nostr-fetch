export interface WebSocketMinCtor {
  new (url: string): WebSocketMin;
}
export interface WebSocketMin {
  readonly readyState: WebSocketReadyState;
  readonly url: string;

  close(code?: number, reason?: string): void;
  send(data: string): void;

  addEventListener(type: "close", listener: (this: WebSocket, ev: WSCloseEvent) => void): void;
  removeEventListener(type: "close", listener: (this: WebSocket, ev: WSCloseEvent) => void): void;

  addEventListener(type: "error", listener: (this: WebSocket, ev: Event) => void): void;
  removeEventListener(type: "error", listener: (this: WebSocket, ev: Event) => void): void;

  addEventListener(type: "message", listener: (this: WebSocket, ev: WSMessageEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (this: WebSocket, ev: WSMessageEvent) => void,
  ): void;

  addEventListener(type: "open", listener: (this: WebSocket, ev: Event) => void): void;
  removeEventListener(type: "open", listener: (this: WebSocket, ev: Event) => void): void;
}

export interface WSCloseEvent {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

export interface WSMessageEvent {
  readonly data: string;
}

/**
 * Constants for WebSocket ready states.
 *
 * When you check the ready state of a WebSocket, you should use them
 * instead of constants defined in the `WebSocket` class to workaround
 * problems that are caused by the fact that constants for ready states
 * have different name in workerd (runtime of Cloudflare Workers).
 */
export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}
