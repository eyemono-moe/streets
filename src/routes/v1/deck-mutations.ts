import type { ColumnDef, Deck } from "../../core/deck/deck";

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
