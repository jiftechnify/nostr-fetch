import { FetchTillEoseOptions, NostrFetcherBackend } from "@nostr-fetch/kernel/fetcherBackend";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import { RxNostrAdapter } from "./adapter";

import { createRxNostr } from "rx-nostr";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { WS } from "vitest-websocket-mock";

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

// FIXME: make tests work
describe.skip("RxNostrAdapter", () => {
  describe("fetchTillEose", () => {
    const defaultOpts: FetchTillEoseOptions = {
      abortSignal: undefined,
      abortSubBeforeEoseTimeoutMs: 5000,
      connectTimeoutMs: 1000,
      skipVerification: false,
      skipFilterMatching: false,
    };
    const optsWithDefault = (opts: Partial<FetchTillEoseOptions>) => {
      return {
        ...defaultOpts,
        ...opts,
      };
    };

    const url = "ws://localhost:8000/";
    let backend: NostrFetcherBackend;
    let wsServer: WS;

    beforeEach(async () => {
      wsServer = new WS(url, { jsonProtocol: true });

      const rxNostr = createRxNostr();
      backend = new RxNostrAdapter(rxNostr, { minLogLevel: "none" });
    });
    afterEach(() => {
      backend.shutdown(); // if we omit this line, a strange error occurs on the next line...
      WS.clean();
    });

    test("fetches events until EOSE", async () => {
      setupMockRelayServer(wsServer, [{ type: "events", eventsSpec: { content: "test", n: 10 } }]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose("ws://localhost:8000", {}, defaultOpts);
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(10);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
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

      expect.toHaveReceivedMessages([]);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });

    test("aborts subscription on WebSocket error", async () => {
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
      // TODO: it's the job of rx-nostr
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

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
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

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });

    test("skips signature verification if enabled", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 10 } },
        { type: "events", eventsSpec: { content: "invalid", invalidSig: true } },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ skipVerification: true }));
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(11);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });

    test("skips filter matching if enabled", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { kind: 1, content: "test", n: 10 } },
        { type: "events", eventsSpec: { kind: 0, content: "malicious", n: 1 } },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(
        url,
        { kinds: [1] },
        optsWithDefault({ skipFilterMatching: true }),
      );
      const evs = await collectAsyncIter(iter);
      expect(evs.length).toBe(11);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), { kinds: [1] }]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });
  });
});
