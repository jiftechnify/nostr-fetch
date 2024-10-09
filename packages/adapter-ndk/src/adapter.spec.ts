import type { FetchTillEoseOptions } from "@nostr-fetch/kernel/fetcherBackend";
import { noopVerifier } from "@nostr-fetch/kernel/utils";
import { collectAsyncIterUntilThrow } from "@nostr-fetch/testutil/asyncIter";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import { NDKAdapter } from "./adapter";

import NDK from "@nostr-dev-kit/ndk";

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import WS from "vitest-websocket-mock";

describe("NDKAdapter", () => {
  describe("fetchTillEose", () => {
    // `skipVerification` has no effect.
    const defaultOpts: FetchTillEoseOptions = {
      eventVerifier: noopVerifier,
      signal: undefined,
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
    let backend: NDKAdapter;
    let wsServer: WS;

    beforeEach(async () => {
      wsServer = new WS(url, { jsonProtocol: true });

      const ndk = new NDK();
      backend = new NDKAdapter(ndk, { minLogLevel: "none" });
    });
    afterEach(() => {
      backend._hardShutdown(); // if we omit this line, a strange error occurs on the next line...
      WS.clean();
    });

    test("fetches events until EOSE", async () => {
      setupMockRelayServer(wsServer, [{ type: "events", eventsSpec: { content: "test", n: 10 } }]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      const evs = await collectAsyncIterUntilThrow(iter);
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
      const evs = await collectAsyncIterUntilThrow(iter);
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
      const evs = await collectAsyncIterUntilThrow(iter);
      expect(evs.length).toBe(9);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });

    test("should be aborted by AbortSignal", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 10 }, intervalMs: 100 },
      ]);

      const timeout = AbortSignal.timeout(500);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ signal: timeout }));
      const evs = await collectAsyncIterUntilThrow(iter);
      expect(evs.length).toBeLessThan(10);

      await expect(wsServer).toReceiveMessage(["REQ", expect.anything(), {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", expect.anything()]);
    });
  });
});
