import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import type { SectionStatus } from "../../core/read/source";
import { useRender } from "../../core/view/render-context";
import { threadSpine } from "../../core/view/thread-spine";
import EventView from "./EventView";

/**
 * 1 本のスレッドを描く (祖先 → 選択したイベント → 返信)。木ではない ——
 * 兄弟の枝も返信の返信も出さない。
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
   * focus は押された瞬間から `EventStore` に既にある —— 購読の応答を待つと
   * 押した本人のノートが一瞬「読み込み中」に化ける。store の 1 回読みで補う。
   */
  const events = createMemo(() => {
    const base = props.events();
    if (base.some((event) => event.id === props.focusId)) return base;
    const seeded = ctx.store.get(props.focusId);
    return seeded ? [...base, seeded] : base;
  });

  const spine = createMemo(() => threadSpine(events(), props.focusId));

  return (
    // `divide-y` は使わない —— 祖先と focus は縦線で繋がった連鎖で、横罫を
    // 引くと繋がりを断ち切る。罫を引くのは返信の側 (兄弟どうしの区切り)。
    <ul data-testid="thread">
      <Show when={!spine().reachedRoot && props.status().phase === "settled"}>
        {/*
          黙って根から始まっているように見せない —— 祖先の欠落は「誰が誰に
          返信したか」を読み違えさせる。ただし `settled` になるまでは出さない
          —— 開いた直後の `reachedRoot: false` は「まだ届いていないだけ」で
          あって「取得できなかった」ではない。
        */}
        <li data-testid="thread-truncated" class="c-secondary p-3 text-caption">
          これより前の返信は取得できていません
        </li>
      </Show>
      <For each={spine().ancestors}>
        {(event) => (
          // `NoteCompact` は padding を持たない (置く側の責務)。focus
          // (`NoteFull` の p-3) と余白を揃えるため置く側でここ `px-3` を足す。
          // 縦は `pt-2` のみ —— 上下で分けると隙間 16px で線が切れる。
          <li data-testid="thread-ancestor" class="px-3 pt-2">
            <EventView id={event.id} variant="compact" threadLine />
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
          // focus 自身の余白は `NoteFull` の p-3。祖先があるときは
          // `-mt-1` で 4px だけ詰めて、最後の祖先のアイコンから focus の
          // アイコンまでを他の行間と同じ 8px に揃える (12px - 4px)。
          // 揃っていないと、線がはみ出す 8px の先に 4px の空白が残る。
          <li
            data-testid="thread-focus"
            classList={{ "-mt-1": spine().ancestors.length > 0 }}
          >
            {/*
              `hideReplyPreview`: focus の親は既に直前の `thread-ancestor`
              として画面に出ているので、`NoteFull` 自身の親プレビューを止めて
              二重表示を防ぐ。`disableThreadOpen`: 重複 push ガードでどのみち
              no-op になる focus 自身を、押せる見た目で隠さない。
            */}
            <EventView
              id={focus().id}
              variant="full"
              hideReplyPreview
              disableThreadOpen
            />
          </li>
        )}
      </Show>
      <For each={spine().replies}>
        {(event) => (
          // 返信どうしは兄弟なので縦線で繋がず、代わりに罫で区切る
          // (`border-t`)。1 件目の罫が focus と返信の境目にもなる。
          <li data-testid="thread-reply" class="b-t-1 p-3">
            <EventView id={event.id} variant="compact" />
          </li>
        )}
      </For>
    </ul>
  );
};

export default ThreadView;
