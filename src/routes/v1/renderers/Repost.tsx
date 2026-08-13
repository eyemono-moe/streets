import { Show } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import {
  embeddedRepostEvent,
  repostTarget,
} from "../../../core/nostr/event-refs";
import type { EventStore } from "../../../core/read/event-store";
import type { RelayUrl } from "../../../core/relay/relay-connection";
import { useRender } from "../../../core/view/render-context";
import EventView from "../EventView";
import Profile from "../Profile";

type RepostTarget = { id: string; relay?: RelayUrl };

/**
 * リポスト対象の id を決める (brief Step 3 の 3 段順)。
 *
 * 1. `content` に埋め込まれたイベント (NIP-18) があれば、それを
 *    `store.put` に通す。**埋め込みはリポストした人が書いた任意の文字列
 *    であり信用できない** —— `embeddedRepostEvent` が確かめるのは形だけ
 *    (`isNostrEvent`) で、署名検証はしていない。`put` の schnorr 検証を
 *    通った (`"rejected"` でない) ときだけ採用する。`"duplicate"` でも
 *    良い —— 既に store にある正規のものがそのまま使われる。
 * 2. 埋め込みが無い、または `"rejected"` だったら `e` タグ (`repostTarget`)
 *    の id へ引き直す。
 * 3. どちらも無ければ対象なし ("リポスト（対象不明）" を呼び出し側が出す)。
 *
 * **`k` タグは読まない。** `k` タグは対象イベントの kind を "申告" する
 * だけで、対象イベント自身が持つ本当の kind と食い違いうる。対象をどう
 * 描くかは `EventView` が対象の実イベントから引いた kind で決めるので、
 * ここで `k` を読んで分岐する理由が無い —— 読むと、`k` が嘘をついていた
 * 場合に実際の kind と食い違ったまま描画してしまう。
 */
const resolveRepostTarget = (
  event: NostrEvent,
  store: EventStore,
): RepostTarget | undefined => {
  const embedded = embeddedRepostEvent(event);
  if (embedded) {
    // 第 2 引数に実在するリレーの URL を渡さない。埋め込みは**リポスト
    // した人が書いた任意の文字列**であり、それを実在リレーが配信したもの
    // として `seenRelays` に記録すると嘘になる。"embedded" は URL の形を
    // していない印であり、実リレーと衝突しない。
    //
    // **今日の `RoutingTable` は `seenRelays` を読んでいない** —— リレー
    // ヒントは `kind:10002` からだけ導出している。この用心が効くのは
    // `seenRelays` をヒントとして読み始めたときで、それは
    // `docs/design/read-layer-followups.md` の Outbox の節が予定している
    // 将来の話である。今は無害だが、そのとき初めて必要になる。
    const result = store.put(embedded, "embedded");
    if (result !== "rejected") {
      return { id: embedded.id };
    }
  }

  const viaTag = repostTarget(event);
  return viaTag ? { id: viaTag.id, relay: viaTag.relay } : undefined;
};

/**
 * kind:6 (テキストノートのリポスト) と kind:16 (汎用リポスト) の詳細表示
 * (spec 6 節の表)。**同じコンポーネントを両方の kind に登録してよい** ——
 * 対象の描画は `EventView` が対象イベント自身の kind から選ぶので、
 * ここでは対象の見た目を一切知らなくてよい (未登録の kind なら fallback
 * が出る、という判断ごと `EventView` に委ねている)。
 */
export const RepostFull: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  // props.event は EventView が Show のコールバック内で 1 度だけ渡す静的な
  // 値 (`EventView.tsx` の `{(found) => <Body event={found()} />}`) なので、
  // ここも 1 回だけ計算すれば足りる。reactive にする必要はない。
  const target = resolveRepostTarget(props.event, ctx.store);

  return (
    <div data-testid="repost" class="space-y-1 pt-1 pr-2 pb-1 pl-1 text-body">
      <p data-testid="repost-by" class="c-secondary text-caption">
        <Profile
          pubkey={props.event.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
        がリポスト
      </p>
      <Show
        when={target}
        fallback={
          <p data-testid="repost-unknown" class="c-secondary text-caption">
            リポスト（対象不明）
          </p>
        }
      >
        {(ref) => (
          <EventView id={ref().id} variant="compact" relayHint={ref().relay} />
        )}
      </Show>
    </div>
  );
};

/**
 * kind:6 / kind:16 の小型表示。「@x がリポスト」の 1 行だけ —— 対象は
 * 描かない (spec 6 節の表)。対象を決める処理 (`resolveRepostTarget`) 自体を
 * 呼ばないのは `NoteCompact` と同じ理由: 呼ばないと決めておくことで、
 * 「compact は関連イベントを一切要求しない」規則がコードを読むだけで
 * 確認できる。
 */
export const RepostCompact: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  return (
    <div data-testid="repost" class="space-y-1 text-caption">
      <p data-testid="repost-by" class="c-secondary text-caption">
        <Profile
          pubkey={props.event.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
        がリポスト
      </p>
    </div>
  );
};
