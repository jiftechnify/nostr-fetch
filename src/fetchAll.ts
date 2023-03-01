import type { Filter, NostrEvent } from "./nostr";
import { isRelaySupportEose } from "./nostr";
import { Relay } from "./relay";

const MAX_LIMIT_PER_REQ = 5000;

type FetchUntilEoseFilter = Filter & {
  until: number;
  limit: number;
};

const fetchEventsTillEose = async (
  relay: Relay,
  filters: FetchUntilEoseFilter[]
): Promise<NostrEvent[]> => {
  return new Promise<NostrEvent[]>((resolve, reject) => {
    const events: NostrEvent[] = [];

    const onNotice = (n: unknown) => {
      reject(Error(`NOTICE: ${JSON.stringify(n)}`));

      relay.off("notice", onNotice);
      relay.off("error", onError);
    };
    const onError = () => {
      reject(Error(`ERROR`));

      relay.off("notice", onNotice);
      relay.off("error", onError);
    };
    relay.on("notice", onNotice);
    relay.on("error", onError);

    // prepare a subscription
    const sub = relay.prepareSub(filters);
    sub.on("event", (evs: NostrEvent[]) => {
      events.push(...evs);
    });
    sub.on("eose", () => {
      sub.close();
      relay.off("notice", onNotice);
      relay.off("error", onError);

      resolve(events);
    });

    // start the subscription
    sub.req();
  });
};

export type FetchAllRangeFilter = Pick<Filter, "since" | "until">;
export type FetchAllFilter = Omit<Filter, "limit" | "since" | "until">;

export type FetchAllOptions = {
  verifyEventSig?: boolean;
  limitPerReq?: number;
};

const defaultFetchAllOptions: Required<FetchAllOptions> = {
  verifyEventSig: true,
  limitPerReq: MAX_LIMIT_PER_REQ,
};

export const fetchAllEvents = async (
  relayUrl: string,
  rangeFilter: FetchAllRangeFilter,
  filters: FetchAllFilter[],
  options: FetchAllOptions = {}
): Promise<NostrEvent[]> => {
  const opt: Required<FetchAllOptions> = {
    ...defaultFetchAllOptions,
    ...options,
  };

  if (filters.length === 0) {
    console.error("you must specify at least one filter");
    return [];
  }
  if (!(await isRelaySupportEose(relayUrl))) {
    console.error("the relay doesn't support EOSE");
    return [];
  }

  const allEvents: NostrEvent[] = [];
  const seenEventIds = new Set<string>();

  let nextUntil = rangeFilter.until ?? Math.floor(Date.now() / 1000);

  const r = new Relay(relayUrl, { verifyEventSig: opt.verifyEventSig });
  await r.connect();

  while (true) {
    try {
      const refinedFilters = filters.map((filter) => {
        return {
          ...rangeFilter,
          ...filter,
          until: nextUntil,
          // limitを明示的に指定することで、返されるイベントの順序が新しい順(created_atの降順)になることが保証される(NIP-01)
          // nostreamはlimitが5000を超えるフィルタを受け付けないので、それ以下に制限する
          limit: Math.min(opt.limitPerReq, MAX_LIMIT_PER_REQ),
        };
      });

      const events = await fetchEventsTillEose(r, refinedFilters);

      // 重複除去
      let numNewEvents = 0;
      let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

      for (const e of events) {
        if (!seenEventIds.has(e.id)) {
          numNewEvents++;
          allEvents.push(e);
          seenEventIds.add(e.id);

          if (e.created_at < oldestCreatedAt) {
            oldestCreatedAt = e.created_at;
          }
        }
      }
      if (numNewEvents === 0) {
        break;
      }

      // 次回取得時のuntilを、今回取得したうち最も古いイベントのcreated_atに設定
      // +1は、untilに関してexclusiveなリレー実装でも正しく動くようにするため
      nextUntil = oldestCreatedAt + 1;
    } catch (err) {
      console.error(err);
      break;
    }
  }

  r.close();
  return allEvents;
};
