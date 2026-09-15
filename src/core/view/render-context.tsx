import { type ParentComponent, createContext, useContext } from "solid-js";
import type { EngagementRequests } from "../read/engagement-requests";
import type { EventRequests } from "../read/event-requests";
import type { EventStore } from "../read/event-store";
import type { ProfileRequests } from "../read/profile-requests";
import type { EventRenderer } from "./renderer-registry";

/**
 * `EventView` とレンダラが共有する依存の束。props で都度渡すと入れ子の
 * `EventView` ごとに配線が増え渡し忘れも型で止まらないので、`/v1` が context で 1 箇所に組み立てる。
 */
export type RenderContextValue = {
  store: EventStore;
  events: EventRequests;
  profiles: ProfileRequests;
  engagements: EngagementRequests;
  /**
   * ログイン中の viewer の pubkey (未ログインは `undefined`)。**必須にする**
   * —— 省略可能だと、自分のリアクション強調忘れが型で止まらず実行時まで気付けない。
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
 * provider の外なら例外を投げる。`undefined` を返し分岐に委ねると、
 * 渡し忘れが「静かに何も描かれない」実行時バグになり、テストで踏むまで気付けない。
 */
export const useRender = (): RenderContextValue => {
  const ctx = useContext(RenderContext);
  if (!ctx) {
    throw new Error("[context provider not found] RenderProvider is not found");
  }
  return ctx;
};
