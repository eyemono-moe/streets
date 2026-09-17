import type { ColumnStackEvent } from "@streets/core/deck/column-stack";
import type { ColumnDef } from "@streets/core/deck/deck";
import {
  type JSX,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";

/**
 * View が上へ渡すイベント。View は「何が起きたか」だけを言い、どう裁定するかは
 * 受け取った段の Mediator が決める。
 */
export type UiEvent =
  | ColumnStackEvent
  /** 重ねた段を、デッキの正規のカラムとして開き直す。 */
  | { type: "deck/add-column"; column: ColumnDef };

type Dispatch = (event: UiEvent) => void;

// Root より上には誰もいない。ここまで来たイベントは裁定する段が無い。
const DispatchContext = createContext<Dispatch>((event) => {
  if (import.meta.env.DEV) {
    console.warn("このイベントを裁定する段がありません", event);
  }
});

/** 上の段へイベントを渡す口。 */
export const useDispatch = (): Dispatch => useContext(DispatchContext);

/**
 * この段で裁定する。`handle` が false を返したイベントは親の段へ渡す
 * （Chain of Responsibility）。DOM のイベントにしないのは、Portal で body の末尾に
 * 出したメニューやダイアログからも、Solid の所有ツリーを辿って届くようにするため。
 */
export const Mediates: ParentComponent<{
  handle: (event: UiEvent) => boolean;
}> = (props): JSX.Element => {
  const parent = useDispatch();
  const dispatch: Dispatch = (event) => {
    if (!props.handle(event)) parent(event);
  };
  return (
    <DispatchContext.Provider value={dispatch}>
      {props.children}
    </DispatchContext.Provider>
  );
};
