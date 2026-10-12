import type { NostrEvent } from "@streets/core/nostr/event";
import type { Section } from "@streets/core/solid/create-section";
import { type Component, Show } from "solid-js";
import NewerLoader from "../deck/NewerLoader";
import type { NewerItem } from "../ui/VirtualList";

/** 持つ件数に上限を設けたセクションについて、`VirtualList` へ渡すもの。 */
export type ListWindow = {
  /** 新しい側を捨てて上限を付けている間は、届いた束の一番上へ飛ばずに読んでいる行に留まる。 */
  followsStart: boolean;
  pending: readonly NewerItem[];
  latest: () => void;
  onAtStart: (atStart: boolean) => void;
};

/**
 * `visible` は一覧と同じ絞り込み。一覧に入れずに溜めている新着を、一覧に出る分だけ
 * 数えるのに使う。
 */
export const listWindow = (
  section: Section,
  visible: (events: NostrEvent[]) => readonly NostrEvent[] = (events) => events,
): ListWindow => ({
  get followsStart() {
    return section.newerPaging() === undefined;
  },
  get pending() {
    return visible(section.pendingNewer()).map((event) => ({
      key: event.id,
      author: event.pubkey,
    }));
  },
  latest: () => section.jumpToLatest(),
  onAtStart: (atStart) => section.setAnchor(atStart ? "head" : "away"),
});

/** 一覧の上端に置く。新しい側を捨てた後（と、過去から読むカラム）だけ、新しい方を取り直す。 */
export const NewerEdge: Component<{ section: Section }> = (props) => (
  <Show when={props.section.newerPaging()}>
    {(paging) => (
      <NewerLoader paging={paging()} onReach={props.section.loadNewer} />
    )}
  </Show>
);
