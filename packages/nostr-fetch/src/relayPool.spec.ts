import { RelayOptions } from "./relay";
import { RelayPool, initRelayPool } from "./relayPool";

import { afterEach, assert, beforeEach, describe, expect, test } from "vitest";
import { WS } from "vitest-websocket-mock";

import { setTimeout as delay } from "node:timers/promises";

class MockRelayServer {
  #ws: WS;
  connected = false;
  url: string;

  #setupMockWS(rurl: string): WS {
    const ws = new WS(rurl);
    ws.on("connection", () => {
      this.connected = true;
    });
    ws.on("close", () => {
      this.connected = false;
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
  const opts: RelayOptions = { connectTimeoutMs: 1000 };
  let pool: RelayPool;

  beforeEach(() => {
    pool = initRelayPool({ minLogLevel: "none" });
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
    const ensuredRelays1 = await pool.ensureRelays([url1, url2], opts);
    expect(ensuredRelays1).toEqual(expect.arrayContaining([url1, url2]));
    assert(srv1.connected && srv2.connected);

    await expect(pool.ensureSingleRelay(url1, opts)).resolves.toBeDefined();
    await expect(pool.ensureSingleRelay(url2, opts)).resolves.toBeDefined();

    // close connections from relays
    await srv1.closeFromServer();
    await srv2.closeFromServer();

    // ensuring a connection to single relay
    await expect(pool.ensureSingleRelay(url1, opts)).resolves.toBeDefined();
    assert(srv1.connected && !srv2.connected);

    // close the connection again
    await srv1.closeFromServer();

    // ensuring connections again
    const ensuredRelays2 = await pool.ensureRelays([url1, url2], opts);
    expect(ensuredRelays2).toEqual(expect.arrayContaining([url1, url2]));
    assert(srv1.connected && srv2.connected);

    // shutdown closes connections to the all relays
    pool.shutdown();
    await delay(1000);
    assert(!srv1.connected && !srv2.connected);
  });

  test("connection error", async () => {
    const url = "ws://localhost:8000/";

    const ensuredRelays1 = await pool.ensureRelays([url], { connectTimeoutMs: 1000 });
    expect(ensuredRelays1).toEqual([]);

    // TODO: test behavior around reconnection cool time
  });
});
