import type { FetchTillEoseOptions, NostrFetcherBackend } from "@nostr-fetch/kernel/fetcherBackend";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import { SimplePoolAdapter } from "./adapter";

import { SimplePool, useWebSocketImplementation } from "nostr-tools";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { WS } from "vitest-websocket-mock";

import ws from "ws";

const collectAsyncIter = async <T>(iter: AsyncIterable<T>): Promise<T[]> => {
  const res: T[] = [];
  try {
    for await (const t of iter) {
      res.push(t);
    }
  } catch (err) {
    console.error(err);
  }
  return res;
};

describe("SimplePoolAdapter", () => {
  describe("fetchTillEose", () => {
    const defaultOpts: FetchTillEoseOptions = {
      abortSignal: undefined,
      abortSubBeforeEoseTimeoutMs: 5000,
      connectTimeoutMs: 1000,
      skipVerification: false,
      skipFilterMatching: false,
      subId: "test",
    };
    const optsWithDefault = (opts: Partial<FetchTillEoseOptions>) => {
      return {
        ...defaultOpts,
        ...opts,
      };
    };

    const url = "ws://localhost:8000";
    let backend: NostrFetcherBackend;
    let wsServer: WS;

    beforeEach(async () => {
      wsServer = new WS(url, { jsonProtocol: true });

      const simplePool = new SimplePool();
      backend = new SimplePoolAdapter(simplePool, { minLogLevel: "none" });
    });
    afterEach(() => {
      WS.clean();
    });

    test("fetches events until EOSE", async () => {
      setupMockRelayServer(wsServer, [{ type: "events", eventsSpec: { content: "test", n: 10 } }]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(10);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });

    test("aborts subscription on NOTICE", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 9 } },
        { type: "notice", notice: "too many concurrent REQs" },
        { type: "events", eventsSpec: { content: "after notice", n: 1 } },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(9);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });

    // It seems that nostr-tools v2 has bug:
    // if WebSocket error event is fired after the connection is established, it tries to send "CLOSE" message to already closed socket.
    // That causes unhandled rejection, so skip this test for now.
    test.skip("aborts subscription on WebSocket error", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 5 } },
        { type: "delay", delayMs: 1000 }, // prevent the connection close before event is received
        { type: "error" },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(5);

      // CLOSE shouldn't be sent
      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
    });

    test("aborts before EOSE if relay doesn't return events for a while", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 9 } },
        { type: "delay", delayMs: 2000 },
        { type: "events", eventsSpec: { content: "deleyed", n: 1 } },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(
        url,
        {},
        optsWithDefault({ abortSubBeforeEoseTimeoutMs: 1000 }),
      );
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(9);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });

    test("should be aborted by AbortController", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 10 }, intervalMs: 100 },
      ]);

      const ac = new AbortController();
      setTimeout(() => {
        ac.abort();
      }, 500);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ abortSignal: ac.signal }));
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBeLessThan(10);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });
  });
});
