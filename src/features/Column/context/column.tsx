import stringify from "safe-stable-stringify";
import {
  type ParentComponent,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { ColumnState } from "../libs/deckSchema";
import { useDeck } from "./deck";

const ColumnContext =
  createContext<
    [
      state: ColumnState,
      actions: {
        updateColumn: (
          column: ColumnState | ((prev: ColumnState) => ColumnState),
        ) => void;
        /**
         * 隣のカラムに新しいカラムを追加する
         *
         * @param column 追加するカラム
         */
        addColumnAfterThis: (column: ColumnState) => void;
        /**
         * このカラムを削除する
         */
        removeThisColumn: () => void;
        /**
         * 一時カラムを開く
         */
        openTempColumn: (
          column: Exclude<ColumnState["tempContent"], undefined>,
        ) => void;
        backOrCloseTempColumn: () => void;
        closeTempColumn: () => void;
        /**
         * 一時カラムを隣のカラムで開き直す
         */
        transferTempColumn: () => void;
      },
    ]
  >();

export const ColumnProvider: ParentComponent<{
  index: number;
}> = (props) => {
  const [state, { addColumn, updateColumn, removeColumn, setTempColumn }] =
    useDeck();

  const updateColumnState = (
    column: ColumnState | ((prev: ColumnState) => ColumnState),
  ) => {
    updateColumn(column, props.index);
  };

  const addColumnAfterThis = (column: ColumnState) => {
    addColumn(column, props.index + 1);
  };

  const [tempColumnHistory, setTempColumnHistory] = createSignal<
    Exclude<ColumnState["tempContent"], undefined>[]
  >([]);

  const openTempColumn = (
    column: Exclude<ColumnState["tempContent"], undefined>,
  ) => {
    // 既に開いていたら何もしない
    if (
      stringify(state.columns[props.index].tempContent) === stringify(column)
    ) {
      return;
    }

    // columnそのままを追加するとproxyを持ったオブジェクトが追加されてバグるため、
    // structuredCloneを使ってコピーする
    setTempColumnHistory((prev) => structuredClone([...prev, column]));
  };

  const backOrCloseTempColumn = () => {
    console.log("backOrCloseTempColumn");
    setTempColumnHistory((prev) => prev.slice(0, -1));
  };

  const closeTempColumn = () => {
    setTempColumnHistory([]);
  };

  createEffect(() => {
    // Historyの最後の要素を表示
    // console.log(JSON.stringify(tempColumnHistory(), null, 2));
    setTempColumn(tempColumnHistory().at(-1), props.index);
  });

  const transferTempColumn = () => {
    const tempContent = state.columns[props.index].tempContent;
    if (tempContent) {
      addColumnAfterThis({
        content: tempContent,
        size: "medium",
      });
      closeTempColumn();
    }
  };

  return (
    <ColumnContext.Provider
      value={[
        state.columns[props.index],
        {
          addColumnAfterThis,
          updateColumn: updateColumnState,
          removeThisColumn: () => removeColumn(props.index),
          openTempColumn,
          backOrCloseTempColumn,
          closeTempColumn,
          transferTempColumn,
        },
      ]}
    >
      {props.children}
    </ColumnContext.Provider>
  );
};

export const useColumn = () => useContext(ColumnContext);
