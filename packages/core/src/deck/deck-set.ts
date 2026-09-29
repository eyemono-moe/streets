import type { ColumnDef, Deck, DeckSet } from "./deck";

/**
 * デッキの集まりへの操作。どれも変化が無ければ同じ参照を返す —— 参照が変わると
 * 保存（署名の要求）が走り、`<For>` がカラムを作り直して購読まで張り直される。
 */

/** 開いているデッキ。覚えていた id のデッキが無くなっていたら、先頭のデッキを開く。 */
export const activeDeck = (set: DeckSet, id: string | undefined): Deck => {
  const found = set.decks.find((deck) => deck.id === id);
  // `loadDeckSet` が 1 つ以上を保証するので、先頭は必ずある。
  return found ?? set.decks[0]!;
};

/** 1 つのデッキを差し替える。カラムの操作（`deck-mutations`）をデッキの集まりへ当てるのに使う。 */
export const updateDeckIn = (
  set: DeckSet,
  id: string,
  update: (deck: Deck) => Deck,
): DeckSet => {
  const index = set.decks.findIndex((deck) => deck.id === id);
  const target = set.decks[index];
  if (!target) return set;
  const next = update(target);
  if (next === target) return set;
  const decks = [...set.decks];
  decks[index] = next;
  return { ...set, decks };
};

/**
 * 新しいデッキの名前の候補。「デッキ 2」「デッキ 3」…のうち、使われていない最初のもの。
 * 名前は重なってもよいが、同じ名前が並ぶと切り替えの一覧で見分けられない。
 */
export const nextDeckName = (set: DeckSet): string => {
  const names = new Set(set.decks.map((deck) => deck.name));
  for (let n = set.decks.length + 1; ; n += 1) {
    const name = `デッキ ${n}`;
    if (!names.has(name)) return name;
  }
};

/** 末尾にデッキを足す。名前が空、または id が既にあれば足さない。 */
export const addDeck = (
  set: DeckSet,
  deck: { id: string; name: string; columns: ColumnDef[] },
): DeckSet => {
  const name = deck.name.trim();
  // 空の名前を保存すると `loadDeckSet` がそのデッキを捨てる。
  if (name.length === 0) return set;
  if (set.decks.some((existing) => existing.id === deck.id)) return set;
  return {
    ...set,
    // 複製元と同じ配列を 2 つのデッキで持たない。片方を変えたときに、もう片方も変わって見える。
    decks: [...set.decks, { id: deck.id, name, columns: [...deck.columns] }],
  };
};

export const renameDeck = (set: DeckSet, id: string, name: string): DeckSet => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return set;
  return updateDeckIn(set, id, (deck) =>
    deck.name === trimmed ? deck : { ...deck, name: trimmed },
  );
};

/** デッキを消す。最後の 1 つは消さない（開くデッキが無くなる）。 */
export const removeDeck = (set: DeckSet, id: string): DeckSet => {
  if (set.decks.length <= 1) return set;
  if (!set.decks.some((deck) => deck.id === id)) return set;
  return { ...set, decks: set.decks.filter((deck) => deck.id !== id) };
};

/** 並べ替え。`to` は移動後に入ってほしい位置。 */
export const moveDeckTo = (set: DeckSet, id: string, to: number): DeckSet => {
  const from = set.decks.findIndex((deck) => deck.id === id);
  if (from < 0 || to < 0 || to >= set.decks.length || from === to) return set;
  const decks = [...set.decks];
  const [moved] = decks.splice(from, 1);
  if (!moved) return set;
  decks.splice(to, 0, moved);
  return { ...set, decks };
};
