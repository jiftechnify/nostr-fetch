import {
  type FetchTillEoseOptions,
  type NostrFetcherBackend,
  isFetchTillEoseFailedSignal,
} from "@nostr-fetch/kernel/fetcherBackend";
import { collectAsyncIterUntilThrow } from "@nostr-fetch/testutil/asyncIter";
import { setupMockRelayServer } from "@nostr-fetch/testutil/mockRelayServer";
import { DefaultFetcherBackend } from "./fetcherBackend";

import { verifyEventSig } from "@nostr-fetch/kernel/crypto";
import type { NostrEvent } from "@nostr-fetch/kernel/nostr";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import WebSocket from "ws";

vi.mock("ws");

describe("DefaultFetcherBackend", () => {
  describe("fetchTillEose", () => {
    const defaultOpts: FetchTillEoseOptions = {
      eventVerifier: verifyEventSig,
      signal: undefined,
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

      backend = new DefaultFetcherBackend({ minLogLevel: "none", webSocketConstructor: WebSocket });
    });
    afterEach(() => {
      WS.clean();
    });

    test("fetches events until EOSE", async () => {
      setupMockRelayServer(wsServer, [{ type: "events", eventsSpec: { content: "test", n: 10 } }]);
      const eventVerifier = vi.fn((ev: NostrEvent) => verifyEventSig(ev));

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ eventVerifier }));
      const evs = await collectAsyncIterUntilThrow(iter);
      expect(evs.length).toBe(10);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);

      expect(eventVerifier).toBeCalled();
    });

    test("handles subscription close by relay w/ CLOSED message", async () => {
      setupMockRelayServer(wsServer, [{ type: "closed", message: "invalid: malformed filter" }]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      try {
        for await (const _ of iter) {
          // do nothing
        }
        expect.unreachable("should throw FetchTillEoseFailedSignal");
      } catch (err) {
        if (isFetchTillEoseFailedSignal(err)) {
          expect(err.message).toMatch("invalid: malformed filter");
        } else {
          expect.unreachable("should throw FetchTillEoseFailedSignal");
        }
      }
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

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });

    test("aborts subscription on WebSocket error", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 5 } },
        { type: "delay", delayMs: 1000 }, // prevent the connection close before event is received
        { type: "error" },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, defaultOpts);
      const evs = await collectAsyncIterUntilThrow(iter);
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
      const evs = await collectAsyncIterUntilThrow(iter);
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
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ signal: ac.signal }));
      const evs = await collectAsyncIterUntilThrow(iter);
      expect(evs.length).toBeLessThan(10);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });

    test("skips signature verification if enabled", async () => {
      setupMockRelayServer(wsServer, [
        { type: "events", eventsSpec: { content: "test", n: 10 } },
        { type: "events", eventsSpec: { content: "invalid", invalidSig: true } },
      ]);

      await backend.ensureRelays([url], { connectTimeoutMs: 1000 });
      const iter = backend.fetchTillEose(url, {}, optsWithDefault({ skipVerification: true }));
      const evs = await collectAsyncIterUntilThrow(iter);
      expect(evs.length).toBe(11);

      await expect(wsServer).toReceiveMessage(["REQ", "test", {}]);
      await expect(wsServer).toReceiveMessage(["CLOSE", "test"]);
    });
  });
});
