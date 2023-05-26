import type { RelayHandle, RelayOptions, RelayPoolHandle } from "nostr-fetch/src/relayTypes";
import { normalizeRelayUrls } from "nostr-fetch/src/utils";
import type { RelayPool } from "nostr-relaypool";

// hacks to obtain unexported types...
let rp: RelayPool;
type NRTRelay = ReturnType<typeof rp.addOrGetRelay>;

let r: NRTRelay;
type NRTSub = ReturnType<typeof r.sub>;

class NRTPoolAdapter implements RelayPoolHandle {
  #pool: RelayPool;

  #logForDebug: typeof console.log | undefined;

  constructor(pool: RelayPool) {
    this.#pool = pool;
  }

  public async ensureRelays(relayUrls: string[], relayOpts: RelayOptions): Promise<RelayHandle[]> {
    const normalizedUrls = normalizeRelayUrls(relayUrls)
    normalizedUrls.map(url => {
      const r = this.#pool.addOrGetRelay(url)
      r.
    })
  }
}
