import { type ParentComponent, createContext, useContext } from "solid-js";
import { type ColumnState, useDeck } from "./deck";

const ColumnContext =
  createContext<
    [
      state: ColumnState,
      actions: {
        addColumnAfterThis: (column: ColumnState) => void;
        removeThisColumn: () => void;
      },
    ]
  >();

export const ColumnProvider: ParentComponent<{
  index: number;
}> = (props) => {
  const [state, { addColumn, removeColumn }] = useDeck();

  return (
    <ColumnContext.Provider
      value={[
        state.columns[props.index],
        {
          addColumnAfterThis: (column) => addColumn(column, props.index + 1),
          removeThisColumn: () => removeColumn(props.index),
        },
      ]}
    >
      {props.children}
    </ColumnContext.Provider>
  );
};

export const useColumn = () => useContext(ColumnContext);
