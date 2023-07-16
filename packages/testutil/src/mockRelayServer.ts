import WS from "vitest-websocket-mock";

import { NostrEvent } from "@nostr-fetch/kernel/nostr";
import { setTimeout as delay } from "timers/promises";
import { FakeEventsSpec, generateFakeEvents } from "./fakeEvent";

/**
 * Mocking Nostr relay server for testing.
 */

type MockWebSocket = Parameters<Parameters<typeof WS.prototype.on>[1]>[0];

type MockRelaySubResponseAction =
  | {
      type: "events";
      eventsSpec: FakeEventsSpec;
      intervalMs?: number;
    }
  | {
      type: "notice";
      notice: unknown;
    }
  | {
      type: "error";
    }
  | {
      type: "delay";
      delayMs: number;
    };
type MockRelaySubResponseScenario = MockRelaySubResponseAction[];

const r2cEventMsg = (subId: string, ev: NostrEvent) => JSON.stringify(["EVENT", subId, ev]);
const r2cEoseMsg = (subId: string) => JSON.stringify(["EOSE", subId]);
const r2cNoticeMsg = (notice: string) => JSON.stringify(["NOTICE", notice]);

// play the "subscription response scenario" on subscription request
const playSubScenario = async (
  ws: WS,
  socket: MockWebSocket,
  scenario: MockRelaySubResponseScenario,
  subId: string,
) => {
  for (const action of scenario) {
    switch (action.type) {
      case "events":
        for (const ev of generateFakeEvents(action.eventsSpec)) {
          const d = action.intervalMs ?? 0;
          if (d > 0) {
            await delay(d);
          }
          socket.send(r2cEventMsg(subId, ev));
        }
        break;

      case "notice":
        socket.send(r2cNoticeMsg("dummy notice"));
        break;

      case "error":
        ws.error();
        return; // return early since a WebSocket error closes socket

      case "delay":
        await delay(action.delayMs);
        break;
    }
  }
  socket.send(r2cEoseMsg(subId));
};

/**
 * attaches the "subscription response scenario" to the mock WebSocket server.
 *
 * please call it before connecting to the mock WebSocket server!
 */
export const setupMockRelayServer = (ws: WS, scenario: MockRelaySubResponseScenario) => {
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
            await playSubScenario(ws, socket, scenario, subId);
          }
        }
      } catch {
        return;
      }
    });
  });
};
