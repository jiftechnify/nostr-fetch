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
