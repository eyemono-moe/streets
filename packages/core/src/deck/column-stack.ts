import type { ColumnDef } from "./deck";

/**
 * カラムの上に重ねた 1 段。閉じても、閉じる動きが終わるまでは残る
 * （すぐ外すと消える動きが見えない）。
 */
export type StackLayer = {
  /** 描画の同一性。同じカラムを閉じてからまた開いても、別の段として数える。 */
  key: number;
  column: ColumnDef;
  open: boolean;
};

export type ColumnStackState = {
  layers: readonly StackLayer[];
  nextKey: number;
};

export type ColumnStackEvent =
  /** 一番上へ積む。 */
  | { type: "stack/open"; column: ColumnDef }
  /** 開いている一番上の段を閉じる。 */
  | { type: "stack/back" }
  /** その段の閉じる動きが終わった。 */
  | { type: "stack/closed"; key: number };

/**
 * 何も重ねていない状態。呼ぶたびに新しく作る —— Solid の store は渡したオブジェクトを
 * そのまま書き換えるので、共有の定数にすると全カラムで同じ段を持ってしまう。
 */
export const emptyColumnStack = (): ColumnStackState => ({
  layers: [],
  nextKey: 0,
});

/** 開いている段。閉じている途中の段は含めない。 */
export const openLayers = (state: ColumnStackState): StackLayer[] =>
  state.layers.filter((layer) => layer.open);

/** いま見えているカラム。開いている一番上の段、無ければ下のカラムそのもの。 */
export const shownColumn = (
  state: ColumnStackState,
  base: ColumnDef,
): ColumnDef => openLayers(state).at(-1)?.column ?? base;

/**
 * 同じものを見せるカラムか。デッキに置いたカラムは id が開き方によらないので、
 * 何を見せるか（source）でも比べる。
 */
const showsSame = (left: ColumnDef, right: ColumnDef): boolean =>
  left.id === right.id ||
  JSON.stringify(left.source) === JSON.stringify(right.source);

/** `base` は段を重ねる下のカラム。それと同じものも重ねない。 */
export const columnStackTransition = (
  state: ColumnStackState,
  event: ColumnStackEvent,
  base?: ColumnDef,
): ColumnStackState => {
  switch (event.type) {
    case "stack/open": {
      // いま見えているものと同じなら重ねない（スレッドの中で、その投稿の画像から
      // 「投稿を開く」を押したときなど）。閉じている途中の段は数えない ——
      // 閉じた直後に同じ投稿を押したら、もう一度開いてほしい。
      const shown = openLayers(state).at(-1)?.column ?? base;
      if (shown && showsSame(shown, event.column)) return state;
      return {
        layers: [
          ...state.layers,
          { key: state.nextKey, column: event.column, open: true },
        ],
        nextKey: state.nextKey + 1,
      };
    }
    case "stack/back": {
      const top = openLayers(state).at(-1);
      if (!top) return state;
      return {
        ...state,
        layers: state.layers.map((layer) =>
          layer === top ? { ...layer, open: false } : layer,
        ),
      };
    }
    case "stack/closed": {
      // 開いている段は外さない。閉じる動きの途中で開き直されていることがある。
      const layers = state.layers.filter(
        (layer) => layer.key !== event.key || layer.open,
      );
      return layers.length === state.layers.length
        ? state
        : { ...state, layers };
    }
  }
};
