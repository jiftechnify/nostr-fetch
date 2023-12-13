/* eslint-disable @typescript-eslint/no-empty-function */
import { Deferred } from "@nostr-fetch/kernel/channel";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import type {
  RelayConnectCb,
  RelayDisconnectCb,
  RelayErrorCb,
  RelayNoticeCb,
  SubClosedCb,
  SubEoseCb,
  SubEventCb,
  WSCloseEvent,
} from "./relay";
import { initRelay } from "./relay";

import { WebSocketReadyState } from "@nostr-fetch/kernel/webSocket";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import "websocket-polyfill";

describe("Relay", () => {
  test(".url returns relay's URL", () => {
    const r = initRelay("wss://example.com", { connectTimeoutMs: 0 });
    expect(r.url).toBe("wss://example.com");
  });

  describe("connect/close", () => {
    const rurl = "ws://localhost:8000";

    afterEach(() => {
      WS.clean();
    });

    test("succeeds", async () => {
      const ws = new WS(rurl);

      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      await expect(
        r.connect().then((r) => {
          return { url: r.url, readyState: r.wsReadyState };
        }),
      ).resolves.toStrictEqual({
        url: rurl,
        readyState: WebSocketReadyState.OPEN,
      });

      r.close();
      await expect(ws.closed).resolves.toBeUndefined();
    });

    test("connect() fails if relay is unreachable", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      await expect(r.connect()).rejects.toThrow("WebSocket error");
    });

    // TODO: how to test connection timeout?
  });

  describe("listeners", () => {
    const rurl = "ws://localhost:8000";

    let ws: WS;
    let spyCbs: {
      connect: RelayConnectCb;
      disconnect: RelayDisconnectCb;
      error: RelayErrorCb;
      notice: RelayNoticeCb;
    };
    beforeEach(() => {
      ws = new WS(rurl, { jsonProtocol: true });
      spyCbs = {
        connect: vi.fn(() => {}),
        disconnect: vi.fn((_: WSCloseEvent) => {}),
        error: vi.fn(() => {}),
        notice: vi.fn((_) => {}),
      };
    });
    afterEach(() => {
      WS.clean();
    });

    test("normal case", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      r.on("connect", spyCbs.connect);
      r.on("disconnect", spyCbs.disconnect);
      r.on("error", spyCbs.error);
      r.on("notice", spyCbs.notice);
      await r.connect();

      await ws.connected;
      const evClose = { code: 1000, reason: "closed", wasClean: true };
      ws.close(evClose);
      await ws.closed;

      expect(spyCbs.connect).toBeCalledTimes(1);

      expect(spyCbs.disconnect).toBeCalledTimes(1);
      expect(spyCbs.disconnect).toBeCalledWith(expect.objectContaining(evClose));

      expect(spyCbs.error).not.toBeCalled();

      expect(spyCbs.notice).not.toBeCalled();
    });

    test("error case", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      r.on("connect", spyCbs.connect);
      r.on("disconnect", spyCbs.disconnect);
      r.on("error", spyCbs.error);
      r.on("notice", spyCbs.notice);
      await r.connect();

      await ws.connected;
      const evClose = { code: 1006, reason: "error", wasClean: false };
      ws.error(evClose);
      await ws.closed;

      expect(spyCbs.connect).toBeCalledTimes(1);

      expect(spyCbs.disconnect).toBeCalledTimes(1);
      expect(spyCbs.disconnect).toBeCalledWith(expect.objectContaining(evClose));

      expect(spyCbs.error).toBeCalledTimes(1);

      expect(spyCbs.notice).not.toBeCalled();
    });

    test("notice", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      r.on("notice", spyCbs.notice);
      await r.connect();

      await ws.connected;
      ws.send(["NOTICE", "dummy notice"]);
      ws.close();
      await ws.closed;

      // wait a bit since it's possible that the callback have not been called yet.
      await delay(100);
      expect(spyCbs.notice).toBeCalledTimes(1);
      expect(spyCbs.notice).toBeCalledWith(expect.stringContaining("dummy notice"));
    });
  });

  describe("subscription", () => {
    const rurl = "ws://localhost:8000";

    let server: WS;
    let spyCbs: {
      event: SubEventCb;
      eose: SubEoseCb;
      closed: SubClosedCb;
    };

    beforeEach(() => {
      server = new WS(rurl, { jsonProtocol: true });
      spyCbs = {
        event: vi.fn((_) => {}),
        eose: vi.fn((_) => {}),
        closed: vi.fn((_) => {}),
      };
    });
    afterEach(() => {
      WS.clean();
    });

    test("normal case", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, [{ type: "events", eventsSpec: { content: "test", n: 5 } }]);

      await r.connect();

      const waitEose = new Deferred<void>();
      const sub = r.prepareSub([{}], {
        skipVerification: false,
        abortSubBeforeEoseTimeoutMs: 1000,
        subId: "normal",
      });
      sub.on("event", spyCbs.event);
      sub.on("eose", spyCbs.eose);
      sub.on("eose", () => waitEose.resolve());
      sub.on("closed", spyCbs.closed);

      sub.req();
      await expect(server).toReceiveMessage(["REQ", "normal", {}]);

      await waitEose.promise;

      sub.close();
      await expect(server).toReceiveMessage(["CLOSE", "normal"]);

      // mock relay sends: 5 EVENTs then EOSE
      expect(spyCbs.event).toBeCalledTimes(5);
      expect(spyCbs.eose).toBeCalledTimes(1);
      expect(spyCbs.closed).not.toBeCalled();
    });

    test("CLOSED by relay", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, [{ type: "closed", message: "closed by relay" }]);

      await r.connect();

      const waitClosed = new Deferred<void>();

      const sub = r.prepareSub([{}], {
        skipVerification: false,
        abortSubBeforeEoseTimeoutMs: 1000,
        subId: "malformed_sub",
      });
      sub.on("event", spyCbs.event);
      sub.on("eose", spyCbs.eose);
      sub.on("closed", spyCbs.closed);
      sub.on("closed", () => waitClosed.resolve());

      sub.req();
      await waitClosed.promise;

      expect(spyCbs.closed).toBeCalledTimes(1);
      expect(spyCbs.closed).toBeCalledWith("closed by relay");
      expect(spyCbs.event).not.toBeCalled();
      expect(spyCbs.eose).not.toBeCalled();
    });

    test("aborts before EOSE if relay doesn't return events for a while", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, [
        { type: "events", eventsSpec: { content: "test" } },
        { type: "delay", delayMs: 2000 },
        { type: "events", eventsSpec: { content: "delayed" } },
      ]);

      await r.connect();

      const waitEose = new Deferred<void>();
      const sub = r.prepareSub([{}], {
        skipVerification: false,
        abortSubBeforeEoseTimeoutMs: 1000,
      });
      sub.on("event", spyCbs.event);
      sub.on("eose", spyCbs.eose);
      sub.on("eose", () => waitEose.resolve());

      sub.req();
      await waitEose.promise;
      sub.close();

      // the subscription should be aborted before 2nd event is sent
      expect(spyCbs.event).toBeCalledTimes(1);
      expect(spyCbs.eose).toBeCalledTimes(1);
    });

    test("verifies signature by default", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, [
        { type: "events", eventsSpec: { content: "test", n: 5 } },
        { type: "events", eventsSpec: { content: "invalid", invalidSig: true } },
      ]);
      await r.connect();

      const waitEose = new Deferred<void>();
      const sub = r.prepareSub([{}], {
        skipVerification: false,
        abortSubBeforeEoseTimeoutMs: 1000,
      });
      sub.on("event", spyCbs.event);
      sub.on("eose", () => waitEose.resolve());

      sub.req();
      await waitEose.promise;
      sub.close();

      // 5 valid events only
      expect(spyCbs.event).toBeCalledTimes(5);
    });

    test("skips signature verification if enabled", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, [
        { type: "events", eventsSpec: { content: "test", n: 5 } },
        { type: "events", eventsSpec: { content: "invalid", invalidSig: true } },
      ]);
      await r.connect();

      const waitEose = new Deferred<void>();
      const sub = r.prepareSub([{}], {
        skipVerification: true,
        abortSubBeforeEoseTimeoutMs: 1000,
      });
      sub.on("event", spyCbs.event);
      sub.on("eose", () => waitEose.resolve());

      sub.req();
      await waitEose.promise;
      sub.close();

      // 5 valid events + 1 invalid event
      expect(spyCbs.event).toBeCalledTimes(6);
    });
  });
});
