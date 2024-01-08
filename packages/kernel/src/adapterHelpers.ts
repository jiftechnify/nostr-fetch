import { ChannelSender } from "./channel";
import { FetchTillEoseAbortedSignal, FetchTillEoseOptions } from "./fetcherBackend";
import { NostrEvent } from "./nostr";

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
 * const resetAutoAbortTimer = setupSubscriptionAbortion(closeSub, tx, options);
 *
 * sub.on("event", (ev: NostrEvent) => {
 *   tx.send(ev);
 *   resetAutoAbortion(); // please call the function returned from `setupSubscriptionAbortion` each time you received an event!
 * });
 * ...
 * ```
 */
export const setupSubscriptionAbortion = (
  closeSub: () => void,
  tx: ChannelSender<NostrEvent>,
  options: FetchTillEoseOptions,
): (() => void) => {
  // auto abortion
  let subAutoAbortTimer: NodeJS.Timeout | undefined;
  const resetAutoAbortTimer = () => {
    if (subAutoAbortTimer !== undefined) {
      clearTimeout(subAutoAbortTimer);
      subAutoAbortTimer = undefined;
    }
    subAutoAbortTimer = setTimeout(() => {
      closeSub();
      tx.error(new FetchTillEoseAbortedSignal("subscription aborted before EOSE due to timeout"));
    }, options.abortSubBeforeEoseTimeoutMs);
  };
  resetAutoAbortTimer(); // initiate subscription auto abortion timer

  // handle abortion by AbortController
  if (options.abortSignal?.aborted) {
    closeSub();
    tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
  }
  options.abortSignal?.addEventListener("abort", () => {
    closeSub();
    tx.error(new FetchTillEoseAbortedSignal("subscription aborted by AbortController"));
  });

  return resetAutoAbortTimer;
};
