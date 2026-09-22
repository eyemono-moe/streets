import type { ReadLayer } from "@streets/core/read/read-layer";
import { type ParentComponent, createContext, useContext } from "solid-js";

/** 画面が読み取り層から使う分だけ。Storybook が固定のイベントで差し替えられる幅に留める。 */
export type ReadAccess = Pick<
  ReadLayer,
  "store" | "events" | "profiles" | "engagements"
> &
  // routing は、本文で人を指すときに添えるリレーを引くのに使う。無ければ添えない。
  Partial<Pick<ReadLayer, "manager" | "routing">>;

const ReadLayerContext = createContext<ReadAccess>();

export const ReadLayerProvider: ParentComponent<{ value: ReadAccess }> = (
  props,
) => (
  <ReadLayerContext.Provider value={props.value}>
    {props.children}
  </ReadLayerContext.Provider>
);

// 渡し忘れを「何も描かれない」ではなく例外として見つけるため、undefined を返さない。
export const useReadLayer = (): ReadAccess => {
  const readLayer = useContext(ReadLayerContext);
  if (!readLayer) throw new Error("ReadLayerProvider が見つかりません");
  return readLayer;
};
