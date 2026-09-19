import type { ColumnDef, Deck } from "./deck";

/**
 * デッキの 4 操作を `Deck → Deck` の純関数として切り出し、副作用を持つ
 * `updateDeck` から分離 —— 変化が無ければ同じ参照を返し無駄な書き込みを避ける。
 */

export const addColumnTo = (deck: Deck, column: ColumnDef): Deck => ({
  ...deck,
  columns: [...deck.columns, column],
});

export const removeColumnFrom = (deck: Deck, id: string): Deck => ({
  ...deck,
  columns: deck.columns.filter((column) => column.id !== id),
});

export const moveColumnIn = (
  deck: Deck,
  id: string,
  direction: -1 | 1,
): Deck => {
  const from = deck.columns.findIndex((column) => column.id === id);
  const to = from + direction;
  // 端では何もしない。ここで clamp すると「左端のカラムの ← を押したら
  // 自分自身と入れ替わる」= 保存だけ走って何も変わらない、という無駄な
  // 書き込みが起きる (id が見つからない場合の from < 0 も同じ扱いにする)。
  if (from < 0 || to < 0 || to >= deck.columns.length) return deck;
  const columns = [...deck.columns];
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
  return { ...deck, columns };
};

export const renameColumnIn = (deck: Deck, id: string, title: string): Deck => {
  const trimmed = title.trim();
  // 空のタイトルを保存してはいけない。`loadDeck` の `minLength(1)` が
  // そのカラムを弾き、**カラム 1 本ではなくデッキ全体**が「壊れている」
  // 判定になって次のリロードで既定デッキに戻る —— 1 本のタイトルを消し
  // ただけで全部消えるという壊れ方になる。
  if (trimmed.length === 0) return deck;
  // 変わらない改名も同じ参照を返す —— `commitTitle` はクリックして blur
  // しただけでも発火するので、弾かないと参照が変わり `<For>` がカラムを
  // 丸ごと remount して購読を張り直してしまう。
  const target = deck.columns.find((column) => column.id === id);
  if (target && target.title === trimmed) return deck;
  return {
    ...deck,
    columns: deck.columns.map((column) =>
      column.id === id ? { ...column, title: trimmed } : column,
    ),
  };
};

/**
 * 1 本のカラムの設定を差し替える。変化が無ければ同じ参照を返す ——
 * 参照が変わると `<For>` がカラムを作り直し、購読まで張り直される。
 */
export const updateColumnIn = (
  deck: Deck,
  id: string,
  patch: Partial<Omit<ColumnDef, "id" | "source">>,
): Deck => {
  const target = deck.columns.find((column) => column.id === id);
  if (!target) return deck;
  const next = { ...target, ...patch };
  // 空のタイトルは保存しない。`loadDeck` がそのカラムを弾き、デッキ全体が
  // 「壊れている」判定になって既定デッキへ戻ってしまう。
  if (next.title.trim().length === 0) return deck;
  const normalized = { ...next, title: next.title.trim() };
  if (JSON.stringify(normalized) === JSON.stringify(target)) return deck;
  return {
    ...deck,
    columns: deck.columns.map((column) =>
      column.id === id ? normalized : column,
    ),
  };
};

/** ドラッグでの並べ替え。`to` は移動後に入ってほしい位置。 */
export const moveColumnToIn = (deck: Deck, id: string, to: number): Deck => {
  const from = deck.columns.findIndex((column) => column.id === id);
  if (from < 0 || to < 0 || to >= deck.columns.length || from === to) {
    return deck;
  }
  const columns = [...deck.columns];
  const [moved] = columns.splice(from, 1);
  if (!moved) return deck;
  columns.splice(to, 0, moved);
  return { ...deck, columns };
};
