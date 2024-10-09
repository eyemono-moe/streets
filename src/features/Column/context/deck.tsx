import { type ParentComponent, createContext, useContext } from "solid-js";
import { produce } from "solid-js/store";
import * as v from "valibot";
import { createLocalStore } from "../../../shared/libs/createLocalStore";

// TODO: StandardListとSetの両方を使用できるように
const columnScheme = v.intersect([
  v.variant("type", [
    v.object({
      type: v.literal("search"),
      query: v.string(),
    }),
    v.object({
      // kind: 10003
      type: v.literal("bookmarks"),
      pubkey: v.string(),
    }),
    v.object({
      type: v.literal("notifications"),
    }),
    v.object({
      // 特定ユーザーのいいね欄
      type: v.literal("reactions"),
      pubkey: v.string(),
    }),
    v.object({
      // 特定ユーザーの投稿と固定ポストを表示
      type: v.literal("user"),
      pubkey: v.string(),
    }),
    v.object({
      type: v.literal("timeline"),
    }),
    v.object({
      type: v.literal("followees"),
      pubkey: v.string(),
    }),
    v.object({
      type: v.literal("followers"),
      pubkey: v.string(),
    }),
  ]),
  v.object({
    size: v.union([
      v.literal("small"),
      v.literal("medium"),
      v.literal("large"),
    ]),
  }),
]);
export type ColumnState = v.InferOutput<typeof columnScheme>;

export type PickColumnState<T extends ColumnState["type"]> = Extract<
  ColumnState,
  { type: T }
>;

const deckState = v.object({
  version: v.literal("0.0"),
  columns: v.array(columnScheme),
});
type DeckState = v.InferOutput<typeof deckState>;

const initialState: DeckState = {
  version: "0.0",
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
    throw new Error("DeckProvider is not found");
  }
  return ctx;
};
