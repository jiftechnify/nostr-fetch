import { afterEach, assert, beforeEach, describe, expect, test } from "vitest";
import { WS } from "vitest-websocket-mock";
import { RelayPool, initRelayPool } from "./relayPool";

class MockRelayServer {
  #ws: WS;
  connected = false;
  url: string;

  #setupMockWS(rurl: string): WS {
    const ws = new WS(rurl);
    ws.on("connection", () => {
      this.connected = true;
    });
    return ws;
  }

  constructor(relayUrl: string) {
    this.url = relayUrl;
    this.#ws = this.#setupMockWS(relayUrl);
  }

  async closeFromServer() {
    this.#ws.close();
    await this.#ws.closed;

    // refresh mock server so that client can connect again
    this.#ws = this.#setupMockWS(this.url);
  }
}

describe("RelayPool", () => {
  let pool: RelayPool;

  beforeEach(() => {
    pool = initRelayPool({ minLogLevel: "all" });
  });
  afterEach(() => {
    WS.clean();
  });

  test("normal case", async () => {
    const url1 = "ws://localhost:8001/";
    const url2 = "ws://localhost:8002/";

    // setup mock relay server
    const srv1 = new MockRelayServer(url1);
    const srv2 = new MockRelayServer(url2);

    // ensure connections to the relays
    const ensuredRelays1 = await pool.ensureRelays([url1, url2], { connectTimeoutMs: 1000 });
    expect(ensuredRelays1).toEqual(expect.arrayContaining([url1, url2]));
    assert(srv1.connected && srv2.connected);

    expect(pool.getRelayIfConnected(url1)).toBeDefined();
    expect(pool.getRelayIfConnected(url2)).toBeDefined();

    // close connection from server -> connection status should be tracked
    await srv1.closeFromServer();
    expect(pool.getRelayIfConnected(url1)).toBeUndefined();
    expect(pool.getRelayIfConnected(url2)).toBeDefined();

    // ensuring again -> should reconnect to the disconnectied relays
    const ensuredRelays2 = await pool.ensureRelays([url1, url2], { connectTimeoutMs: 1000 });
    expect(ensuredRelays2).toEqual(expect.arrayContaining([url1, url2]));
    expect(pool.getRelayIfConnected(url1)).toBeDefined();
    expect(pool.getRelayIfConnected(url2)).toBeDefined();

    // shutdown closes connections to the all relays
    pool.shutdown();
    expect(pool.getRelayIfConnected(url1)).toBeUndefined();
    expect(pool.getRelayIfConnected(url2)).toBeUndefined();
  });

  test("connection error", async () => {
    const url = "ws://localhost:8000/";

    const ensuredRelays1 = await pool.ensureRelays([url], { connectTimeoutMs: 1000 });
    expect(ensuredRelays1).toEqual([]);

    // TODO: test behavior around reconnection cool time
  });
});
