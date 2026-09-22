import { parseRelayList } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  RELAY_DISCOVERY_KIND,
  RELAY_MONITOR_RELAYS,
  type RecommendationSort,
  type RelayDiscovery,
  countFolloweeRelays,
  discoveryFilter,
  latestDiscoveries,
  recommendRelays,
  topCandidates,
} from "@streets/core/settings/relay-recommendation";
import { createQuery } from "@tanstack/solid-query";
import { type Component, createMemo, createSignal } from "solid-js";
import { useReadLayer } from "../read-layer";
import type { RelayEdit } from "./RelayMediator";
import RelayRecommendationsView, {
  type RecommendationState,
} from "./RelayRecommendationsView";

const RELAY_LIST_KIND = 10002;
/** 画面に並べる数。候補はもう少し多く集めて、点数の高いものから出す。 */
const SHOWN = 20;
/** 計測は頻繁には変わらない。ページを開き直すたびに聞き直さない。 */
const DISCOVERY_STALE_MS = 60 * 60 * 1000;

/**
 * おすすめのリレー。候補はフォロー中の人の kind:10002（ウォームアップで
 * store に入っている）から数えるので、候補のために新しく繋がない。計測
 * （NIP-66）だけは、このページを開いたときに 1 回、計測の置き場へ聞く。
 */
const RelayRecommendations: Component<{ edit: RelayEdit }> = (props) => {
  const { store, manager } = useReadLayer();
  const [sort, setSort] = createSignal<RecommendationSort>("score");

  const followees = () => props.edit.followees?.() ?? [];
  const settled = () => props.edit.routingSettled?.() ?? true;

  const users = createMemo(() => {
    settled();
    return countFolloweeRelays(
      followees().flatMap((pubkey) => {
        const event = store.latestReplaceable(RELAY_LIST_KIND, pubkey);
        return event ? [parseRelayList(event)] : [];
      }),
    );
  });
  const candidates = createMemo(() => topCandidates(users()));

  const discovery = createQuery(() => ({
    queryKey: ["relay-discovery", candidates()],
    enabled: manager !== undefined && candidates().length > 0,
    staleTime: DISCOVERY_STALE_MS,
    queryFn: async () => {
      const filter = discoveryFilter(candidates());
      await manager?.fetchOnce([filter], {
        relays: [...RELAY_MONITOR_RELAYS],
      });
      return latestDiscoveries(
        filter["#d"]
          .flatMap((d) => store.eventsByTag("d", d))
          .filter((event) => event.kind === RELAY_DISCOVERY_KIND),
      );
    },
  }));

  const state = (): RecommendationState => {
    if (!settled()) return { phase: "loading" };
    if (followees().length === 0) return { phase: "no-followees" };
    if (candidates().length === 0) return { phase: "empty" };
    const discoveries = discovery.data ?? new Map<RelayUrl, RelayDiscovery>();
    return {
      phase: "ready",
      discovery:
        manager === undefined || discovery.isError
          ? "missing"
          : discovery.data === undefined
            ? "loading"
            : discoveries.size > 0
              ? "ready"
              : "missing",
      items: recommendRelays({
        candidates: candidates(),
        users: users(),
        followees: followees().length,
        discoveries,
        own: props.edit.entries(),
        sort: sort(),
      }).slice(0, SHOWN),
    };
  };

  return (
    <RelayRecommendationsView
      state={state()}
      sort={sort()}
      onSort={setSort}
      infoOf={props.edit.infoOf}
    />
  );
};

export default RelayRecommendations;
