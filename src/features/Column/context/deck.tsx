import { createMediaQuery } from "@solid-primitives/media";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  onMount,
  useContext,
} from "solid-js";
import { produce } from "solid-js/store";
import * as v from "valibot";
import { createLocalStore } from "../../../shared/libs/createLocalStore";
import { genID } from "../../../shared/libs/id";
import {
  type ColumnState,
  type ColumnStateWithoutID,
  type DeckState,
  deckState,
} from "../libs/deckSchema";

const initialState: DeckState = {
  version: 0,
  columns: [
    {
      content: { type: "timeline" },
      size: "medium",
      id: genID(),
    },
    {
      content: { type: "notifications" },
      size: "medium",
      id: genID(),
    },
  ],
  display: {
    theme: {
      accent: "#8340bb",
      ui: "#302070",
    },
    showLoading: true,
  },
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
        addColumn: (column: ColumnStateWithoutID, index?: number) => void;
        /**
         * Update a column in the deck
         *
         * @param column - The new column state or a function that updates the previous column state
         * @param index - The index of the column to update
         */
        updateColumn: (
          column:
            | ColumnStateWithoutID
            | ((prev: ColumnStateWithoutID) => ColumnStateWithoutID),
          index: number,
        ) => void;
        /**
         * Set a temporary column content to the deck
         *
         * @param content - The column content to add
         * @param index - The index to insert the column at. If not provided, the column will be added to the end
         */
        setTempColumn: (
          content: ColumnState["tempContent"],
          index?: number,
        ) => void;
        /**
         * Set the size of a column
         *
         * @param size - The new size of the column
         * @param index - The index of the column to update
         */
        setColumnSize: (size: ColumnState["size"], index: number) => void;
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
        /**
         * Set the accent color of the deck
         *
         * @param color - The new accent color
         */
        setAccentColor: (color: string) => void;
        /**
         * Set the UI color of the deck
         *
         * @param color - The new UI color
         */
        setUIColor: (color: string) => void;
        /**
         * Toggle the loading indicator
         */
        toggleShowLoading: () => void;
      },
      layout: Accessor<"horizontal" | "vertical">,
    ]
  >();

export const DeckProvider: ParentComponent = (props) => {
  const [state, setState] = createLocalStore<DeckState>(
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

  const addColumn = (
    column: ColumnStateWithoutID,
    index?: number,
    scroll = true,
  ) => {
    if (index === undefined) {
      const _index = state.columns.length;
      setState("columns", _index, { ...column, id: genID() });
      if (scroll) {
        scrollIntoView(_index);
      }
      return;
    }
    setState(
      "columns",
      produce((columns) => {
        columns.splice(index, 0, { ...column, id: genID() });
      }),
    );
    if (scroll) {
      scrollIntoView(index);
    }
  };

  const updateColumn = (
    column:
      | ColumnStateWithoutID
      | ((prev: ColumnStateWithoutID) => ColumnStateWithoutID),
    index: number,
  ) => {
    setState("columns", index, column);
  };

  const setTempColumn = (
    column: ColumnState["tempContent"],
    index?: number,
  ) => {
    const _index = index ?? state.columns.length;
    setState("columns", _index, "tempContent", column);
  };

  const setColumnSize = (size: ColumnState["size"], index: number) => {
    setState("columns", index, "size", size);
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
    const el = document.getElementById(`col-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  };

  let themeStyleTag: HTMLElement;
  onMount(() => {
    // biome-ignore lint/style/noNonNullAssertion: style#theme-style in index.html
    themeStyleTag = document.getElementById("theme-style")!;

    window.CSS.registerProperty({
      name: "--theme-accent-color",
      syntax: "<color>",
      inherits: true,
      initialValue: "#000",
    });
    window.CSS.registerProperty({
      name: "--theme-ui-color",
      syntax: "<color>",
      inherits: true,
      initialValue: "#000",
    });
  });

  createEffect(() => {
    const themeVariables: Record<`--${string}`, string> = {
      "--theme-accent-color": state.display.theme.accent,
      "--theme-ui-color": state.display.theme.ui,
    };

    themeStyleTag.textContent = `:root {
      ${Object.entries(themeVariables)
        .map(([key, value]) => `${key}:${value}`)
        .join(";")}
      }`;
  });

  const setAccentColor = (color: string) => {
    setState("display", "theme", "accent", color);
  };
  const setUIColor = (color: string) => {
    setState("display", "theme", "ui", color);
  };

  const toggleShowLoading = () => {
    setState("display", "showLoading", (show) => !show);
  };

  // TODO: 外観設定で切り替えられるようにする
  const isVertical = createMediaQuery("(max-aspect-ratio: 2/3)");
  const layout = () => (isVertical() ? "vertical" : "horizontal");

  return (
    <DeckContext.Provider
      value={[
        state,
        {
          addColumn,
          updateColumn,
          setTempColumn,
          setColumnSize,
          removeColumn,
          moveColumn,
          scrollIntoView,
          setAccentColor,
          setUIColor,
          toggleShowLoading,
        },
        layout,
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
