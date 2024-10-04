import type { ChannelSender } from "./channel";
import { FetchTillEoseAbortedSignal, type FetchTillEoseOptions } from "./fetcherBackend";
import type { NostrEvent } from "./nostr";

/**
 * Helper that sets up two types of subscription abortions:
 *
 * - Auto-abortion when time (specified by `abortSubBeforeEoseTimeoutMs`) has passed without receiving any event since the last event was received
 * - Abortion by an AbortController (if enabled by `abortSignal`)
 *
 * Returns a function to reset the timer for the auto-abortion. Implementers of the `NostrFetcherBackend` **MUST** make sure that the function is called each time received an event from a relay.
 * Otherwise, the auto-abortion will not work collectly.
 *
 * @param closeSub A function that specify the logic of closing subscriptions.
 * @param tx A sender endpoint of {@linkcode Channel}. It will be used to signal the abortion to the caller of this `NostrFetcherBackend`.
 * @param options Pass `FetcherTillEoseOptions` down here.
 * @returns A function which resets the timer for the auto-abortion.
 *
 * @example
 * ```
 * const [tx, chIter] = Channel.make<NostrEvent>();
 * const sub = ...; // initializing subscription
 * const closeSub = () => {
 *   sub.close();
 *   // any cleanups for subscription go here
 * }
 * const resetAutoAbortTimer = setupSubscriptionAutoAbortion(closeSub, tx, options);
 *
 * // make sure that you call the function returned from
 * // `setupSubscriptionAutoAbortion` each time you received an event!
 * sub.on("event", (ev: NostrEvent) => {
 *   tx.send(ev);
 *   resetAutoAbortion();
 * });
 * ...
 * ```
 */
export const setupSubscriptionAutoAbortion = (
  closeSub: () => void,
  tx: ChannelSender<NostrEvent>,
  options: FetchTillEoseOptions,
): (() => void) => {
  // auto abortion
  let subAutoAbortTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (subAutoAbortTimer !== undefined) {
      clearTimeout(subAutoAbortTimer);
      subAutoAbortTimer = undefined;
    }
  };

  const resetTimer = () => {
    clearTimer();
    subAutoAbortTimer = setTimeout(() => {
      closeSub();
      tx.error(new FetchTillEoseAbortedSignal("subscription aborted before EOSE due to timeout"));
    }, options.abortSubBeforeEoseTimeoutMs);
  };
  resetTimer(); // initiate subscription auto abortion timer

  // handle abortion by AbortController
  if (options.signal?.aborted) {
    closeSub();
    clearTimer();
    tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
  }
  options.signal?.addEventListener("abort", () => {
    closeSub();
    clearTimer();
    tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
  });

  return resetTimer;
};
