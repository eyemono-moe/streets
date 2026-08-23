import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import type { SectionStatus } from "../../core/read/source";
import { useRender } from "../../core/view/render-context";
import { threadSpine } from "../../core/view/thread-spine";
import EventView from "./EventView";

/**
 * 1 本のスレッドを描く (背骨: 祖先 → 選択したイベント → 返信)。木ではない
 * —— 兄弟の枝も返信の返信も出さない (計算そのものは `threadSpine`)。
 * 件数がカラムより桁違いに少ないので `ColumnItems.tsx` の
 * `content-visibility` 最適化は要らない。
 */
const ThreadView: Component<{
  events: () => NostrEvent[];
  focusId: string;
  /** 背骨を運ぶセクションの状態。「取得できていません」の表示を settle
   * するまで待たせるのに使う (下記コメント参照)。 */
  status: () => SectionStatus;
}> = (props) => {
  const ctx = useRender();

  /**
   * focus は押された瞬間から `EventStore` に既にある —— そこから描画
   * された `<article>` が `open()` を呼んだのだから。`SectionReader` は
   * 購読の応答が届いて初めて `items` を埋めるので、そちらだけを待つと
   * 「押した本人のノート」がまず「読み込み中」に化ける往復が 1 回余計に
   * 挟まる。store の 1 回読みで補い、祖先・返信だけを購読に追いつかせる
   * —— subscribe はしない (`EventView` と同じ罠を踏まない): focus 自身の
   * 中身が後から変わることはなく、`events()` の更新 (祖先・返信の到着)
   * だけで spine は引き直される。
   */
  const events = createMemo(() => {
    const base = props.events();
    if (base.some((event) => event.id === props.focusId)) return base;
    const seeded = ctx.store.get(props.focusId);
    return seeded ? [...base, seeded] : base;
  });

  const spine = createMemo(() => threadSpine(events(), props.focusId));

  return (
    <ul data-testid="thread" class="divide-y">
      <Show when={!spine().reachedRoot && props.status().phase === "settled"}>
        {/*
          黙って根から始まっているように見せない (ADR-0011)。祖先が
          欠けたスレッドは「誰が誰に返信したのか」を読み違えさせる。
          ただし `settled` (これ以上届く見込みが無い) になるまでは出さない
          —— セクションは購読の応答が届いて初めて祖先を埋めるので、開いた
          直後の `reachedRoot: false` は「まだ届いていないだけ」であって
          「取得できなかった」ではない。settle 前に出すと、まだ存在しない
          劣化を確定した事実として見せることになり、これも ADR-0011 が
          禁じる不正直さの逆方向にあたる。
        */}
        <li data-testid="thread-truncated" class="c-secondary p-3 text-caption">
          これより前の返信は取得できていません
        </li>
      </Show>
      <For each={spine().ancestors}>
        {(event) => (
          <li data-testid="thread-ancestor">
            <EventView id={event.id} variant="compact" />
          </li>
        )}
      </For>
      <Show
        when={spine().focus}
        fallback={
          <li data-testid="thread-focus" class="c-secondary p-3 text-caption">
            読み込み中
          </li>
        }
      >
        {(focus) => (
          <li data-testid="thread-focus">
            <EventView id={focus().id} variant="full" />
          </li>
        )}
      </Show>
      <For each={spine().replies}>
        {(event) => (
          <li data-testid="thread-reply">
            <EventView id={event.id} variant="compact" />
          </li>
        )}
      </For>
    </ul>
  );
};

export default ThreadView;
