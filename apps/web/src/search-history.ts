import {
  SEARCH_HISTORY_ENABLED_STORAGE_KEY,
  type SearchHistory,
  type SearchHistoryEvent,
  isSearchHistoryStorageKey,
  loadSearchHistory,
  loadSearchHistoryEnabled,
  saveSearchHistory,
  saveSearchHistoryEnabled,
  searchHistoryStorageKey,
  searchHistoryTransition,
} from "@streets/core/search/history";
import { type Accessor, createSignal, untrack } from "solid-js";

const readEnabled = (): boolean => {
  try {
    return loadSearchHistoryEnabled(
      localStorage.getItem(SEARCH_HISTORY_ENABLED_STORAGE_KEY),
    );
  } catch {
    return true;
  }
};

const [searchHistoryEnabled, setEnabled] = createSignal(readEnabled());

/** この端末で検索履歴を残すか。 */
export { searchHistoryEnabled };

/** 切ったら、どのアカウントの分も消す。残さないと決めた人の履歴を置いておかない。 */
export const setSearchHistoryEnabled = (on: boolean) => {
  setEnabled(on);
  try {
    localStorage.setItem(
      SEARCH_HISTORY_ENABLED_STORAGE_KEY,
      saveSearchHistoryEnabled(on),
    );
    if (on) return;
    const keys = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.key(i),
    ).filter((key): key is string => key !== null);
    for (const key of keys) {
      if (isSearchHistoryStorageKey(key)) localStorage.removeItem(key);
    }
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};

export type SearchHistoryStore = {
  history: Accessor<SearchHistory>;
  apply: (event: SearchHistoryEvent) => void;
};

/** そのアカウントの検索履歴。履歴を残さない設定の間は、何も出さず何も覚えない。 */
export const createSearchHistory = (
  account: string | undefined,
): SearchHistoryStore => {
  const key = searchHistoryStorageKey(account);
  const read = (): SearchHistory => {
    try {
      return loadSearchHistory(localStorage.getItem(key));
    } catch {
      return [];
    }
  };
  const [history, setHistory] = createSignal(read());
  return {
    history: () => (searchHistoryEnabled() ? history() : []),
    // 外から条件を渡されたとき、パネルは effect の中から送ってくる。読んだ履歴を
    // その effect に追わせると、残すたびに effect が走り直して送り続ける。
    apply: (event) =>
      untrack(() => {
        if (!searchHistoryEnabled()) return;
        const next = searchHistoryTransition(history(), event);
        setHistory(next);
        try {
          localStorage.setItem(key, saveSearchHistory(next));
        } catch {
          // 保存できなくても、いまの画面には当たっている。
        }
      }),
  };
};
