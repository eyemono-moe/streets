import type { Component } from "solid-js";
import type { NostrEvent } from "../nostr/event";

export type EventVariant = "full" | "compact";

/**
 * kind 1 種類分のレンダラ。`full`/`compact` の 2 つを必ず持つ
 * (spec 3 節)。`compact` は関連イベントを一切要求しない —— それが
 * 引用・返信・リポストの入れ子が構造的に深さ 1 で止まる理由そのもの
 * (Task 4 のレンダラ実装がこの規則を守る)。
 */
export type EventBodyProps = {
  event: NostrEvent;
  /**
   * このイベントの**下に**会話が続く (返信の親として置かれている)。
   * アイコンの下へ縦線を伸ばし、親と子を 1 本のスレッドとして繋ぐ。
   *
   * 連鎖する行の間は常に 8px 空ける (v0 の `EventBase` の `pb-2` と同じ
   * 間隔)。線はその 8px を自分で跨ぐ —— 詰めて繋げるのではなく、
   * 「行間は 8px、線が渡る」を 1 つの規則にする。
   *
   * レンダラごとの任意対応でよい —— 線を引く場所を持たない kind
   * (`UnknownKind` など) は受け取って無視する。
   */
  threadLine?: boolean;
  /**
   * 返信先の親イベントを本体の上に積む自前のプレビュー (`NoteFull` が
   * 持つもの) を出さない。`ThreadView` が背骨の focus をこの `full` として
   * 描くとき、その親は既に祖先の最後の 1 件として同じ画面に (縦線付きで)
   * 出ているので、ここでも積むと同じイベントが 2 回並ぶ。
   *
   * レンダラごとの任意対応でよい —— 自前の親プレビューを持たない kind は
   * 受け取って無視する (`threadLine` と同じ扱い)。
   */
  hideReplyPreview?: boolean;
  /**
   * このイベントを押しても「このイベントのスレッドを開く」を発火させない
   * (押せる見た目も付けない)。`ThreadView` が背骨の focus を描くときに
   * 立てる —— focus 自身を押しても、ナビゲーションスタックの重複 push
   * ガード (`DeckColumn.tsx` の `openThread`) により何も起きない。ADR-0026
   * 「押しても何も起きないものを押せる見た目にしない」に従い、その no-op
   * を隠さず最初から押せる見た目にしない。
   *
   * レンダラごとの任意対応でよい —— スレッドを開く仕組みを持たない kind
   * は受け取って無視する (`threadLine` と同じ扱い)。
   */
  disableThreadOpen?: boolean;
  /** 入れ子の full 表示でも本文向けアクション列だけを抑止する。 */
  hideActions?: boolean;
};

export type EventRenderer = {
  kind: number;
  full: Component<EventBodyProps>;
  compact: Component<EventBodyProps>;
};

/**
 * 型を通すためだけの恒等関数。呼び出し側 (Task 4 の各レンダラ定義) が
 * オブジェクトリテラルに `EventRenderer` の型注釈を書かなくても形が
 * 強制されるようにする。
 */
export const defineRenderer = (renderer: EventRenderer): EventRenderer =>
  renderer;

/**
 * kind からレンダラを引く。**先に登録された方を返す** (同じ kind が
 * 複数登録されている場合)。既定のレンダラ集合の前に上書き用の 1 件を
 * `prepend` すれば、そちらが優先される規則になる —— 後から足すものが
 * 既定を上書きしたいときは配列の先頭に足す、という 1 つの約束だけで
 * 済ませるため (追記なら末尾に足すだけで良いのに対し、上書きだけ特別な
 * 呼び方を要求するのは非対称で覚えにくい)。このスライスで重複登録を
 * 作る呼び出し元は無いが、規則を先に固定しておく。
 */
export const rendererFor = (
  renderers: readonly EventRenderer[],
  kind: number,
): EventRenderer | undefined =>
  renderers.find((renderer) => renderer.kind === kind);
