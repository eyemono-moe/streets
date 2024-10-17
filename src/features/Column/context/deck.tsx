import { type ParentComponent, createContext, useContext } from "solid-js";
import { produce } from "solid-js/store";
import * as v from "valibot";
import { createLocalStore } from "../../../shared/libs/createLocalStore";
import {
  type ColumnState,
  type DeckState,
  deckState,
} from "../libs/deckSchema";

const initialState: DeckState = {
  version: 0,
  columns: [
    {
      type: "timeline",
      size: "medium",
    },
    {
      type: "notifications",
      size: "medium",
    },
  ],
};

const DeckContext =
  createContext<
    [
      state: DeckState,
      actions: {
        addColumn: (column: ColumnState, index?: number) => void;
        removeColumn: (index: number) => void;
        moveColumn: (from: number, to: number) => void;
      },
    ]
  >();

export const DeckProvider: ParentComponent = (props) => {
  const [state, setState] = createLocalStore(
    "monostr.deckState",
    initialState,
    (str) => {
      const res = v.safeParse(deckState, JSON.parse(str));
      if (res.success) {
        return res.output;
      }
      console.error(res.issues);
      return initialState;
    },
  );

  const addColumn = (column: ColumnState, index?: number) => {
    if (index === undefined) {
      setState("columns", state.columns.length, column);
      return;
    }
    setState(
      "columns",
      produce((columns) => {
        columns.splice(index, 0, column);
      }),
    );
  };

  const removeColumn = (index: number) => {
    setState(
      "columns",
      produce((columns) => {
        columns.splice(index, 1);
      }),
    );
  };

  const moveColumn = (from: number, to: number) => {
    setState(
      "columns",
      produce((columns) => {
        const [removed] = columns.splice(from, 1);
        columns.splice(to, 0, removed);
      }),
    );
  };

  return (
    <DeckContext.Provider
      value={[
        state,
        {
          addColumn,
          removeColumn,
          moveColumn,
        },
      ]}
    >
      {props.children}
    </DeckContext.Provider>
  );
};

export const useDeck = () => {
  const ctx = useContext(DeckContext);
  if (!ctx) {
    throw new Error("[context provider not found] DeckProvider is not found");
  }
  return ctx;
};
