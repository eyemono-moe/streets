import type { ReadLayer } from "@streets/core/read/read-layer";
import { type ParentComponent, createContext, useContext } from "solid-js";

const ReadLayerContext = createContext<ReadLayer>();

export const ReadLayerProvider: ParentComponent<{ value: ReadLayer }> = (
  props,
) => (
  <ReadLayerContext.Provider value={props.value}>
    {props.children}
  </ReadLayerContext.Provider>
);

// 渡し忘れを「何も描かれない」ではなく例外として見つけるため、undefined を返さない。
export const useReadLayer = (): ReadLayer => {
  const readLayer = useContext(ReadLayerContext);
  if (!readLayer) throw new Error("ReadLayerProvider が見つかりません");
  return readLayer;
};
