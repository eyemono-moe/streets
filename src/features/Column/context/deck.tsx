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
        /**
         * Add a column to the deck
         *
         * @param column - The column to add
         * @param index - The index to insert the column at. If not provided, the column will be added to the end
         */
        addColumn: (column: ColumnState, index?: number) => void;
        /**
         * Remove a column from the deck
         *
         * @param index - The index of the column to remove
         */
        removeColumn: (index: number) => void;
        /**
         * Move a column to a new index
         *
         * @param from - The index of the column to move
         * @param to - The index to move the column to
         */
        moveColumn: (from: number, to: number) => void;
        /**
         * Scroll a column into view
         *
         * @param index - The index of the column to scroll into view
         */
        scrollIntoView: (index: number) => void;
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

  const addColumn = (column: ColumnState, index?: number, scroll = true) => {
    if (index === undefined) {
      const _index = state.columns.length;
      setState("columns", _index, column);
      if (scroll) {
        scrollIntoView(_index);
      }
      return;
    }
    setState(
      "columns",
      produce((columns) => {
        columns.splice(index, 0, column);
      }),
    );
    if (scroll) {
      scrollIntoView(index);
    }
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

  const scrollIntoView = (index: number) => {
    console.log("scrollIntoView", index);
    const el = document.getElementById(`col-${index}`);
    console.log("el", el);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  };

  return (
    <DeckContext.Provider
      value={[
        state,
        {
          addColumn,
          removeColumn,
          moveColumn,
          scrollIntoView,
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
