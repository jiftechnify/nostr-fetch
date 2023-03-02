import { Channel } from "./channel";
import type { Filter, NostrEvent } from "./nostr";
import { isRelaySupportEose } from "./nostr";
import { Relay } from "./relay";

const MAX_LIMIT_PER_REQ = 5000;

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

export async function* fetchAllEvents(
  relayUrl: string,
  filters: FetchAllFilter[],
  rangeFilter: FetchAllRangeFilter,
  options: FetchAllOptions = {}
): AsyncGenerator<NostrEvent, void, void> {
  const opt: Required<FetchAllOptions> = {
    ...defaultFetchAllOptions,
    ...options,
  };

  if (filters.length === 0) {
    throw Error("you must specify at least one filter");
  }
  if (!(await isRelaySupportEose(relayUrl))) {
    throw Error(`the relay '${relayUrl}' doesn't support EOSE`);
  }

  const r = new Relay(relayUrl, { verifyEventSig: opt.verifyEventSig });
  await r.connect();

  const seenEventIds = new Set<string>();
  let nextUntil = rangeFilter.until ?? Math.floor(Date.now() / 1000);

  try {
    while (true) {
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

      let numNewEvents = 0;
      let oldestCreatedAt = Number.MAX_SAFE_INTEGER;

      for await (const e of fetchEventsTillEose(r, refinedFilters)) {
        // 重複除去
        if (!seenEventIds.has(e.id)) {
          numNewEvents++;
          seenEventIds.add(e.id);
          if (e.created_at < oldestCreatedAt) {
            oldestCreatedAt = e.created_at;
          }
          yield e;
        }
      }
      if (numNewEvents === 0) {
        break;
      }

      // 次回取得時のuntilを、今回取得したうち最も古いイベントのcreated_atに設定
      // +1は、untilに関してexclusiveなリレー実装でも正しく動くようにするため
      nextUntil = oldestCreatedAt + 1;
    }
  } finally {
    r.close();
  }
}

export const collectAllEvents = async (
  relayUrl: string,
  filters: FetchAllFilter[],
  rangeFilter: FetchAllRangeFilter,
  options: FetchAllOptions = {}
): Promise<NostrEvent[]> => {
  const res: NostrEvent[] = [];
  for await (const ev of fetchAllEvents(
    relayUrl,
    filters,
    rangeFilter,
    options
  )) {
    res.push(ev);
  }
  return res;
};

type FetchUntilEoseFilter = Filter & {
  until: number;
  limit: number;
};

const fetchEventsTillEose = (
  relay: Relay,
  filters: FetchUntilEoseFilter[]
): AsyncIterable<NostrEvent> => {
  const [tx, chIter] = Channel.make<NostrEvent>();

  const onNotice = (n: unknown) => {
    tx.error(Error(`NOTICE: ${JSON.stringify(n)}`));

    relay.off("notice", onNotice);
    relay.off("error", onError);
  };
  const onError = () => {
    tx.error(Error("ERROR"));

    relay.off("notice", onNotice);
    relay.off("error", onError);
  };
  relay.on("notice", onNotice);
  relay.on("error", onError);

  // prepare a subscription
  const sub = relay.prepareSub(filters);
  sub.on("event", (evs: NostrEvent[]) => {
    for (const e of evs) {
      tx.send(e);
    }
  });
  sub.on("eose", () => {
    sub.close();
    relay.off("notice", onNotice);
    relay.off("error", onError);

    tx.close();
  });

  // start the subscription
  sub.req();

  return chIter;
};
