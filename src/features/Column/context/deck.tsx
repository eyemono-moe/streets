import {
  type ParentComponent,
  createContext,
  createEffect,
  onMount,
  useContext,
} from "solid-js";
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
      content: { type: "timeline" },
      size: "medium",
    },
    {
      content: { type: "notifications" },
      size: "medium",
    },
  ],
  display: {
    theme: {
      accent: "#8340bb",
      ui: "#302070",
    },
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
        addColumn: (column: ColumnState, index?: number) => void;
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

  const setTempColumn = (
    column: ColumnState["tempContent"],
    index?: number,
  ) => {
    const _index = index ?? state.columns.length;
    setState("columns", _index, "tempContent", column);
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

  return (
    <DeckContext.Provider
      value={[
        state,
        {
          addColumn,
          setTempColumn,
          removeColumn,
          moveColumn,
          scrollIntoView,
          setAccentColor,
          setUIColor,
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
