import { describe, expect, it } from "vite-plus/test";
import {
  SEARCH_HISTORY_LIMIT,
  loadSearchHistory,
  loadSearchHistoryEnabled,
  saveSearchHistory,
  searchHistoryParts,
  searchHistoryStorageKey,
  searchHistoryTransition,
} from "./history";

const searched = (query: string) =>
  ({ type: "search/searched", query }) as const;

describe("searchHistoryTransition", () => {
  it("探した条件を先頭に足す", () => {
    expect(searchHistoryTransition(["いぬ"], searched("ねこ"))).toEqual([
      "ねこ",
      "いぬ",
    ]);
  });

  it("同じ条件は重ねず先頭へ移す。前後の空白は比べない", () => {
    expect(
      searchHistoryTransition(["いぬ", "ねこ"], searched("  ねこ ")),
    ).toEqual(["ねこ", "いぬ"]);
  });

  it("空の条件は残さない", () => {
    expect(searchHistoryTransition(["ねこ"], searched("   "))).toEqual([
      "ねこ",
    ]);
  });

  it("上限を超えたら古いものから落とす", () => {
    const full = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, i) => `${i}`);
    const next = searchHistoryTransition(full, searched("新しい"));
    expect(next).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(next[0]).toBe("新しい");
    expect(next).not.toContain(`${SEARCH_HISTORY_LIMIT - 1}`);
  });

  it("1 件だけ外せる", () => {
    expect(
      searchHistoryTransition(["ねこ", "いぬ"], {
        type: "search/history-remove",
        query: "ねこ",
      }),
    ).toEqual(["いぬ"]);
  });

  it("すべて消せる", () => {
    expect(
      searchHistoryTransition(["ねこ"], { type: "search/history-clear" }),
    ).toEqual([]);
  });
});

describe("loadSearchHistory", () => {
  it("保存したものを読み戻す", () => {
    expect(loadSearchHistory(saveSearchHistory(["ねこ", "#nostr"]))).toEqual([
      "ねこ",
      "#nostr",
    ]);
  });

  it("未保存・壊れた値は空として読む", () => {
    expect(loadSearchHistory(null)).toEqual([]);
    expect(loadSearchHistory("{")).toEqual([]);
    expect(loadSearchHistory('[1, "a"]')).toEqual([]);
  });
});

describe("searchHistoryStorageKey", () => {
  it("アカウントごとに置き場を分け、ログインしていない間も別に持つ", () => {
    const a = searchHistoryStorageKey("a".repeat(64));
    const b = searchHistoryStorageKey("b".repeat(64));
    const guest = searchHistoryStorageKey(undefined);
    expect(new Set([a, b, guest]).size).toBe(3);
  });
});

describe("loadSearchHistoryEnabled", () => {
  it("既定は残す。切ったときだけ残さない", () => {
    expect(loadSearchHistoryEnabled(null)).toBe(true);
    expect(loadSearchHistoryEnabled("false")).toBe(false);
  });
});

describe("searchHistoryParts", () => {
  it("人の指定を鍵として取り出し、ほかは言葉のまま返す", () => {
    const pubkey = "a".repeat(64);
    expect(searchHistoryParts(`ねこ -from:${pubkey} to:壊れた`)).toEqual([
      { type: "text", text: "ねこ" },
      { type: "person", prefix: "-from:", pubkey },
      { type: "text", text: "to:壊れた" },
    ]);
  });
});
