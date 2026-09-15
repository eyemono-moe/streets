import type { Component } from "solid-js";
import type { NostrEvent } from "../nostr/event";

export type EventVariant = "full" | "compact";

/** kind 1 種類分のレンダラ。`compact` が関連イベントを要求しないことが、入れ子の引用・返信・リポストが深さ 1 で止まる理由。 */
export type EventBodyProps = {
  event: NostrEvent;
  /** 会話が下に続くとき、アイコン下へ縦線を伸ばして親子を繋ぐ (行間 8px を線が跨ぐ)。任意対応。 */
  threadLine?: boolean;
  /** 返信先プレビューを出さない。親は祖先の最後の 1 件として同画面に既に出ているので、二重表示を避ける (任意対応)。 */
  hideReplyPreview?: boolean;
  /** スレッドを開かせない (押せる見た目も付けない)。背骨の focus は重複 push ガードでどのみち no-op。 */
  disableThreadOpen?: boolean;
  /** 入れ子の full 表示でも本文向けアクション列だけを抑止する。 */
  hideActions?: boolean;
};

export type EventRenderer = {
  kind: number;
  full: Component<EventBodyProps>;
  compact: Component<EventBodyProps>;
};

/** 型を通すためだけの恒等関数。呼び出し側が `EventRenderer` の型注釈を書かなくても形が強制されるようにする。 */
export const defineRenderer = (renderer: EventRenderer): EventRenderer =>
  renderer;

/** kind からレンダラを引く。**先に登録された方を返す**。上書き用の 1 件を既定の前に `prepend` すれば優先される。 */
export const rendererFor = (
  renderers: readonly EventRenderer[],
  kind: number,
): EventRenderer | undefined =>
  renderers.find((renderer) => renderer.kind === kind);
