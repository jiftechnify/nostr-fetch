import { Channel } from "./channel";
import type { Filter, NostrEvent } from "./nostr";
import type { RelayPoolOptions } from "./relayPool";
import { RelayPool, initRelayPool } from "./relayPool";
import { emptyAsyncGen } from "./utils";

type EnsureRelaysOptions = {
  connectTimeoutMs: number;
};

export type FetchTillEoseOptions = {
  subId?: string;
  skipVerification: boolean;
  connectTimeoutMs: number;
  abortSubBeforeEoseTimeoutMs: number;
  abortSignal: AbortSignal | undefined;
};

/**
 * Set of APIs to fetch past events from nostr relays.
 *
 * `NostrFetcher` implements its functions on top of this.
 */
export interface NostrFetcherBase {
  /**
   * Ensures connections to the relays prior to an event subscription.
   */
  ensureRelays: (relayUrls: string[], options: EnsureRelaysOptions) => Promise<void>;

  /**
   * Closes all connections to relays.
   */
  closeAll: () => void;

  /**
   * Fetches Nostr events matching `filters` from the relay specified by `relayUrl` until EOSE.
   *
   * The result is an `AsyncIterable` of Nostr events.
   * You can think that it's an asynchronous channel which conveys events.
   * The channel will be closed once EOSE is reached.
   *
   * If no connection to the specified relay has been established at the time this function is called, it will return an empty channel.
   *
   * Hint:
   * You can make use of a `Channel` to convert "push" style code (bunch of event listers) to `AsyncIterable`.
   */
  fetchTillEose: (
    relayUrl: string,
    filters: Filter[],
    options: FetchTillEoseOptions
  ) => AsyncIterable<NostrEvent>;
}

/**
 * Default implementation of `NostrFetchBase`.
 */
export class DefaultFetcherBase implements NostrFetcherBase {
  #relayPool: RelayPool;
  #logForDebug: typeof console.log | undefined;

  public constructor(options: RelayPoolOptions) {
    this.#relayPool = initRelayPool(options);
    if (options.enableDebugLog) {
      this.#logForDebug = console.log;
    }
  }

  public async ensureRelays(relayUrls: string[], options: EnsureRelaysOptions): Promise<void> {
    await this.#relayPool.ensureRelays(relayUrls, options);
  }

  public closeAll(): void {
    this.#relayPool.closeAll();
  }

  public fetchTillEose(
    relayUrl: string,
    filters: Filter[],
    options: FetchTillEoseOptions
  ): AsyncIterable<NostrEvent> {
    const [tx, chIter] = Channel.make<NostrEvent>();

    const relay = this.#relayPool.getRelayIfConnected(relayUrl);
    if (relay === undefined) {
      return emptyAsyncGen();
    }

    // error handlings
    const onNotice = (n: unknown) => {
      tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));
      removeRelayListeners();
    };
    const onError = () => {
      tx.error(Error("ERROR"));
      removeRelayListeners();
    };
    const removeRelayListeners = () => {
      relay.off("notice", onNotice);
      relay.off("error", onError);
    };

    relay.on("notice", onNotice);
    relay.on("error", onError);

    // prepare a subscription
    const sub = relay.prepareSub(filters, options);

    // handle subscription events
    sub.on("event", (ev: NostrEvent) => {
      tx.send(ev);
    });
    sub.on("eose", ({ aborted }) => {
      if (aborted) {
        this.#logForDebug?.(
          `[${relay.url}] subscription (id: ${sub.subId}) aborted before EOSE due to timeout`
        );
      }

      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // handle abortion
    options.abortSignal?.addEventListener("abort", () => {
      this.#logForDebug?.(
        `[${relay.url}] subscription (id: ${sub.subId}) aborted via AbortController`
      );

      sub.close();
      tx.close();
      removeRelayListeners();
    });

    // start the subscription
    sub.req();

    return chIter;
  }
}
