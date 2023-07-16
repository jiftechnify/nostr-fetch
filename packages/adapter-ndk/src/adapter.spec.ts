import { FetchTillEoseOptions, NostrFetcherBackend } from "@nostr-fetch/kernel/fetcherBackend";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import { NDKAdapter } from "./adapter";

import NDK from "@nostr-dev-kit/ndk";

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

describe("NDKAdapter", () => {
  describe("fetchTillEose", () => {
    // `skipVerification` has no effect.
    const defaultOpts: FetchTillEoseOptions = {
      abortSignal: undefined,
      abortSubBeforeEoseTimeoutMs: 5000,
      connectTimeoutMs: 1000,
      skipVerification: false,
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

      const ndk = new NDK();
      backend = new NDKAdapter(ndk, { minLogLevel: "none" });
    });
    afterEach(() => {
      backend.shutdown(); // if we omit this line, a strange error occurs on the next line...
      WS.clean();
    });

    test("fetches events until EOSE", async () => {
      setupMockRelayServer(wsServer, [{ type: "events", eventsSpec: { content: "test", n: 10 } }]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
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
      // await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
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
  });
});
