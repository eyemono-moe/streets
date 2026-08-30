import type { ColumnDef, Deck } from "../../core/deck/deck";

/**
 * デッキの 4 つの変更操作を `Deck → Deck` の純関数として切り出したもの。
 * `v1.tsx` の `updateDeck` (localStorage への書き込みを伴う) から分けて
 * あるのは、副作用の無い形でユニットテストできるようにするため ——
 * とくに `renameColumnIn` の「空タイトルは拒否する」は e2e (Step 6) では
 * 覆われない (リロード確認は追加・削除・並べ替えの 3 主張だけ) ので、
 * ここで直接固定する。
 *
 * 変化が無い呼び出し (`moveColumnIn` の端、`renameColumnIn` の空文字) は
 * 受け取った `deck` をそのまま (同一参照で) 返す —— 呼び出し側 (`v1.tsx`)
 * が参照比較だけで「書き込む必要が無い」と判定でき、無駄な
 * `localStorage.setItem` を避けられる。
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
  // ただけで全部消えるという壊れ方になる (task-4-brief.md)。
  if (trimmed.length === 0) return deck;
  // 実際に値が変わらない改名も同じ参照を返す (最終レビュー Minor 2) ——
  // `commitTitle` はタイトルを見るためにクリックして blur しただけでも
  // 発火するので、ここで弾かないと「クリックして見ただけ」で該当カラムの
  // オブジェクト参照が変わり、`<For>` がそのカラムを丸ごと remount して
  // 購読を張り直してしまう (identity ではなく `id` でカラムを追う根本修正は
  // 次のスライスへ繰延、`docs/design/read-layer-followups.md` 参照)。
  const target = deck.columns.find((column) => column.id === id);
  if (target && target.title === trimmed) return deck;
  return {
    ...deck,
    columns: deck.columns.map((column) =>
      column.id === id ? { ...column, title: trimmed } : column,
    ),
  };
};
