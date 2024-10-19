import {
  type ParentComponent,
  createContext,
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
        addColumnAfterThis: (column: ColumnState) => void;
        removeThisColumn: () => void;
        openTempColumn: (
          column: Exclude<ColumnState["tempContent"], undefined>,
        ) => void;
        backOrCloseTempColumn: () => void;
        closeTempColumn: () => void;
      },
    ]
  >();

export const ColumnProvider: ParentComponent<{
  index: number;
}> = (props) => {
  const [state, { addColumn, removeColumn, setTempColumn }] = useDeck();

  const [tempColumnHistory, setTempColumnHistory] = createSignal<
    ColumnState["tempContent"][]
  >([]);

  const openTempColumn = (
    column: Exclude<ColumnState["tempContent"], undefined>,
  ) => {
    setTempColumnHistory((prev) => [...prev, column]);
    setTempColumn(column, props.index);
  };

  const backOrCloseTempColumn = () => {
    setTempColumnHistory((prev) => prev.slice(0, -1));
    setTempColumn(tempColumnHistory().at(-1), props.index);
  };

  const closeTempColumn = () => {
    setTempColumnHistory([]);
    setTempColumn(undefined, props.index);
  };

  return (
    <ColumnContext.Provider
      value={[
        state.columns[props.index],
        {
          addColumnAfterThis: (column) => addColumn(column, props.index + 1),
          removeThisColumn: () => removeColumn(props.index),
          openTempColumn,
          backOrCloseTempColumn,
          closeTempColumn,
        },
      ]}
    >
      {props.children}
    </ColumnContext.Provider>
  );
};

export const useColumn = () => useContext(ColumnContext);
