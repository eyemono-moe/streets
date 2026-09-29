import {
  DECK_LAYOUT_STORAGE_KEY,
  type DeckLayout,
  MULTI_COLUMN_MIN_WIDTH,
  loadDeckLayout,
  showsMultiColumn,
} from "@streets/core/settings/deck-layout-setting";
import { createSignal } from "solid-js";

const read = (): DeckLayout => {
  try {
    return loadDeckLayout(localStorage.getItem(DECK_LAYOUT_STORAGE_KEY));
  } catch {
    // ストレージが使えない環境でも、画面幅に合わせて使う。
    return "auto";
  }
};

const [deckLayout, setValue] = createSignal(read());

// トーストの置き場もこれで決めるので、画面の部品の外で 1 度だけ見張る。
const query = matchMedia(`(min-width: ${MULTI_COLUMN_MIN_WIDTH}px)`);
const [wide, setWide] = createSignal(query.matches);
query.addEventListener("change", () => setWide(query.matches));

/** カラムの並べ方（この端末の設定）。 */
export { deckLayout };

export const setDeckLayout = (layout: DeckLayout) => {
  setValue(layout);
  try {
    localStorage.setItem(DECK_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};

/** カラムを横に並べるか。設定と画面幅から決める。 */
export const isMultiColumn = (): boolean =>
  showsMultiColumn(deckLayout(), wide());
