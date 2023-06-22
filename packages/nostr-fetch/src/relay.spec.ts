import { Deferred } from "@nostr-fetch/kernel/channel";
import { initRelay } from "./relay";
import {
  RelayConnectCb,
  RelayDisconnectCb,
  RelayErrorCb,
  RelayNoticeCb,
  SubEoseCb,
  SubEventCb,
} from "./relayTypes";

import { setTimeout as delay } from "node:timers/promises";
import { finishEvent } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import "websocket-polyfill";

// sha256("test")
const dummyPrivkey = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

type MockRelayServerOptions = {
  sendEventDelayMs?: number;
  sendInvalidEvent?: boolean;
};

const setupMockRelayServer = (ws: WS, opts: MockRelayServerOptions = {}) => {
  const { sendEventDelayMs, sendInvalidEvent } = {
    ...{ sendEventDelayMs: 0, sendInvalidEvent: false },
    ...opts,
  };

  const evs = [
    { kind: 1, tags: [], content: "test1", created_at: 1000 },
    { kind: 1, tags: [], content: "test2", created_at: 0 },
  ];
  const invalidEv = (() => {
    const ev = finishEvent(
      { kind: 1, tags: [], content: "invalid", created_at: 2000 },
      dummyPrivkey
    );
    // change first char of the signature
    ev.sig = `${ev.sig[0] === "0" ? "1" : "0"}${ev.sig.slice(1)}`;
    return ev;
  })();

  ws.on("connection", (socket) => {
    socket.on("message", async (msg) => {
      if (typeof msg !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(msg);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return;
        }
        switch (parsed[0]) {
          case "REQ": {
            const subId = parsed[1] as string;

            if (sendInvalidEvent) {
              socket.send(JSON.stringify(["EVENT", subId, invalidEv]));
            }
            for (const ev of evs) {
              await delay(sendEventDelayMs);
              socket.send(JSON.stringify(["EVENT", subId, finishEvent(ev, dummyPrivkey)]));
            }
            socket.send(JSON.stringify(["EOSE", subId]));
          }
        }
      } catch {
        return;
      }
    });
  });
};

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
        })
      ).resolves.toStrictEqual({
        url: rurl,
        readyState: WebSocket.OPEN,
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
        connect: vi.fn(() => {
          /* */
        }),
        disconnect: vi.fn(() => {
          /* */
        }),
        error: vi.fn(() => {
          /* */
        }),
        notice: vi.fn((n: unknown) => {
          console.info("notice:", n);
        }),
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
    };

    beforeEach(() => {
      server = new WS(rurl, { jsonProtocol: true });
      spyCbs = {
        event: vi.fn((_) => {
          /* */
        }),
        eose: vi.fn((_) => {
          /* */
        }),
      };
    });
    afterEach(() => {
      WS.clean();
    });

    test("normal case", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server);

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

      sub.req();
      await expect(server).toReceiveMessage(["REQ", "normal", {}]);

      await waitEose.promise;

      sub.close();
      await expect(server).toReceiveMessage(["CLOSE", "normal"]);

      // mock relay should send 2 EVENTs then EOSE
      expect(spyCbs.event).toBeCalledTimes(2);
      expect(spyCbs.eose).toBeCalledTimes(1);
    });

    test("abort before EOSE", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, { sendEventDelayMs: 2000 });

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

      // the subscription should be aborted before sending events
      expect(spyCbs.event).not.toBeCalled();
      expect(spyCbs.eose).toBeCalledTimes(1);
    });

    test("skip verification", async () => {
      const r = initRelay(rurl, { connectTimeoutMs: 5000 });
      setupMockRelayServer(server, { sendInvalidEvent: true });
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

      // 1 invalid event + 2 valid events
      expect(spyCbs.event).toBeCalledTimes(3);
    });
  });
});
