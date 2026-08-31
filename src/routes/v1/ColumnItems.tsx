import { createIntersectionObserver } from "@solid-primitives/intersection-observer";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import {
  growRenderWindow,
  initialRenderWindow,
  renderCount,
} from "../../core/view/render-window";
import EventView from "./EventView";

/**
 * カラムの一覧。先頭 N 件だけを描き、番兵が見えたら増やす。**アイテムは
 * 通常の文書フローに置く** —— 絶対配置だと scroll anchoring が働かず飛ぶ。
 */
const ColumnItems: Component<{ items: () => readonly NostrEvent[] }> = (
  props,
) => {
  // `window` はグローバルを隠すので名前を変えている。
  const [renderWindow, setRenderWindow] = createSignal(initialRenderWindow());
  const itemIds = createMemo(() => props.items().map((event) => event.id));

  // 件数は窓と items() からの**純粋な導出**。effect で補正しないので、
  // items() が変わった瞬間に正しい件数が出る —— 補正待ちの一瞬に末尾の
  // アイテムが `<For>` から外れて再マウントされることが無い。
  const count = createMemo(() => renderCount(renderWindow(), itemIds()));
  const visible = createMemo(() => props.items().slice(0, count()));
  const hasMore = () => count() < props.items().length;

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  // 実装されていない環境では番兵が働かないだけで、初期の N 件は描かれる。
  // ここで落ちるとカラムごと出なくなる。
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
    <div>
      <ul data-testid="items" class="divide-y">
        {/*
          1 件ずつをカードにせず `divide-y` で区切る —— イベント側が枠を
          持つと入れ子の引用枠と見分けが付かなくなる。左右の余白は区切り線が
          幅いっぱい伸びるようイベント側 (`p-2`) が持つ。
        */}
        <For each={visible()}>
          {(event) => (
            // `content-visibility: auto` は画面外の描画をブラウザに省かせる。
            // `contain-intrinsic-size: auto 120px` の `auto` は「一度描いた
            // 高さを覚えておく」指示 —— 無いと画面外で高さが推定値へ戻りスクロールバーが跳ねる。
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
      </ul>
      {/*
        `<ul>` の外に置く —— `divide-y` は兄弟要素すべてに区切り線を当てる
        ので、`<li>` として中に置くと最後のアイテムの下に線が余計に出る。
        まだ描いていないアイテムがあるときだけ出す —— 常に出すと全件描画後も
        交差したまま張り付き、コールバックが走り続ける。
      */}
      <Show when={hasMore()}>
        {(_hasMore) => {
          // `<Show>` が番兵を外しても `sentinel()` はデタッチされた要素を
          // 握ったままになる (無害だが監視し続ける)。子を関数で渡すと
          // `when` が偽に戻るたび scope が破棄され、ここで `onCleanup` が効く。
          onCleanup(() => setSentinel(undefined));
          return (
            <div data-testid="items-sentinel" ref={setSentinel} class="h-1" />
          );
        }}
      </Show>
    </div>
  );
};

export default ColumnItems;
