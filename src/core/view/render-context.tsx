import { type ParentComponent, createContext, useContext } from "solid-js";
import type { EventRequests } from "../read/event-requests";
import type { EventStore } from "../read/event-store";
import type { ProfileRequests } from "../read/profile-requests";
import type { ReactionRequests } from "../read/reaction-requests";
import type { EventRenderer } from "./renderer-registry";

/**
 * `EventView` とレンダラ (Task 4) が共有する依存の束 (spec 2.1 節)。
 * props でこの 4 つを毎回下へ渡すと、レンダラの中に現れる `EventView`
 * (引用先・返信の親・リポスト対象) 1 つを書くたびに配線コードが増え、
 * 渡し忘れが型でしか (=実行するまで) 止まらない。context にすることで
 * `/v1` が 1 箇所で組み立て、レンダラは `useRender()` を呼ぶだけにする。
 */
export type RenderContextValue = {
  store: EventStore;
  events: EventRequests;
  profiles: ProfileRequests;
  reactions: ReactionRequests;
  /**
   * ログイン中の viewer の pubkey。未ログインなら `undefined`。**必須
   * フィールドにする** —— 省略可能にすると、レンダラが自分が押した
   * リアクションを強調し忘れても型では止まらず、実行するまで気付けない
   * (spec 5 節)。
   */
  viewerPubkey: string | undefined;
  renderers: readonly EventRenderer[];
};

const RenderContext = createContext<RenderContextValue>();

export const RenderProvider: ParentComponent<{ value: RenderContextValue }> = (
  props,
) => (
  <RenderContext.Provider value={props.value}>
    {props.children}
  </RenderContext.Provider>
);

/**
 * provider の外で呼ばれたら例外を投げる。`undefined` を返して呼び出し側の
 * 分岐に委ねると、provider を渡し忘れたときに「静かに何も描かれない」
 * 実行時バグになり、テストで踏むまで気付けない。
 */
export const useRender = (): RenderContextValue => {
  const ctx = useContext(RenderContext);
  if (!ctx) {
    throw new Error("[context provider not found] RenderProvider is not found");
  }
  return ctx;
};
