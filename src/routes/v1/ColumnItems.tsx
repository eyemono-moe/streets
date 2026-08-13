import { createIntersectionObserver } from "@solid-primitives/intersection-observer";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import {
  growRenderWindow,
  initialRenderWindow,
  renderCount,
} from "../../core/view/render-window";
import EventView from "./EventView";

/**
 * カラムの一覧。**先頭 N 件だけを描き、下端の番兵が見えたら N を増やす。**
 *
 * `DeckColumn` から分けているのは、窓の状態と番兵という 1 つの関心が
 * カラムのヘッダ・タイトル編集・診断表示と混ざらないようにするため。
 *
 * **アイテムは通常の文書フローのまま置く。** 絶対配置にするとブラウザの
 * scroll anchoring が働かなくなり、新着が先頭へ積まれたときスクロール位置が
 * 飛ぶ (仕様 2 節に実測あり)。`divide-y` の区切り線とアイコンの `sticky` も
 * 同じ理由で通常フローに依存している。
 */
const ColumnItems: Component<{ items: () => readonly NostrEvent[] }> = (
  props,
) => {
  // `window` はグローバルを隠すので名前を変えている。
  const [renderWindow, setRenderWindow] = createSignal(initialRenderWindow());
  const itemIds = createMemo(() => props.items().map((event) => event.id));

  // 件数は窓と items() からの**純粋な導出**。effect で補正しないので、
  // items() が変わった瞬間に正しい件数が出る —— 補正待ちの一瞬に末尾の
  // アイテムが `<For>` から外れて再マウントされることが無い (spec 4.1)。
  const count = createMemo(() => renderCount(renderWindow(), itemIds()));
  const visible = createMemo(() => props.items().slice(0, count()));
  const hasMore = () => count() < props.items().length;

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  // 実装されていない環境では番兵が働かないだけで、初期の N 件は描かれる
  // (仕様 6 節)。ここで落ちるとカラムごと出なくなる。
  if (typeof IntersectionObserver !== "undefined") {
    createIntersectionObserver(
      () => {
        const element = sentinel();
        return element ? [element] : [];
      },
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setRenderWindow((previous) => growRenderWindow(previous, itemIds()));
        }
      },
    );
  }

  return (
    <ul data-testid="items" class="divide-y">
      {/*
        1 件ずつをカードにせず `divide-y` で区切る (v0 の `InfiniteEvents`
        と同じ)。イベント側が枠を持つと、引用・返信先として入れ子に置かれた
        ときの枠 (`Note.tsx` の `NestedEventCard`) と見分けが付かなくなる。
        区切り線がカラム幅いっぱいに伸びる必要があるので、左右の余白は
        ここではなくイベント側 (`p-2`) が持つ。
      */}
      <For each={visible()}>
        {(event) => (
          // `content-visibility: auto` —— 画面外のアイテムのレイアウトと
          // 描画をブラウザに省かせる。カラムは最大 500 件を仮想スクロール
          // なしで描き (`MAX_ITEMS_PER_SECTION`)、返信は親も描くので
          // カラム 3 本で DOM は 4 万ノードを超える。
          //
          // **初回描画の詰まりと引き換えである。** 3 カラム 1500 件で実測
          // (スクロール中央値 / longtask 最長):
          //   何もしない            24.4ms / 345ms
          //   contain: content      19.0ms / 204ms
          //   content-visibility    16.8ms / 1258ms
          // 1500 件が一度に現れる初回は重くなるが、スクロールは 60fps に
          // 戻る (20ms 超のフレームが 59/89 → 0/89)。
          //
          // `contain-intrinsic-size: auto 120px` の `auto` は「一度描いた
          // 高さを覚えておく」指示。これが無いと画面外へ出た瞬間に高さが
          // 推定値へ戻り、スクロールバーが跳ねる。
          <li
            data-testid="item"
            style={{
              "content-visibility": "auto",
              "contain-intrinsic-size": "auto 120px",
            }}
          >
            <EventView id={event.id} variant="full" />
          </li>
        )}
      </For>
      {/*
        まだ描いていないアイテムがあるときだけ出す —— 常に出すと、全件を
        描き終えた後も交差したまま張り付き、増やすものが無いのにコール
        バックが走り続ける。
      */}
      <Show when={hasMore()}>
        <li data-testid="items-sentinel" ref={setSentinel} class="h-1" />
      </Show>
    </ul>
  );
};

export default ColumnItems;
