import * as v from "valibot";
import { toPubkey } from "./query";

/** 探した条件。新しいものが先頭。 */
export type SearchHistory = readonly string[];

export const SEARCH_HISTORY_LIMIT = 20;

/**
 * アカウントごとの置き場。ログインしていない間も別に持つ —— 誰かが探したものを、
 * 別の人のログインで見せないため。
 */
const STORAGE_PREFIX = "streets.v1.searchHistory:";

export const searchHistoryStorageKey = (account: string | undefined): string =>
  `${STORAGE_PREFIX}${account ?? "guest"}`;

/** 履歴を消すときに、どのアカウントの分も拾えるように。 */
export const isSearchHistoryStorageKey = (key: string): boolean =>
  key.startsWith(STORAGE_PREFIX);

const schema = v.array(v.string());

/** 未保存・読めない値は、何も探していないとして扱う。 */
export const loadSearchHistory = (raw: string | null): SearchHistory => {
  if (raw === null) return [];
  try {
    const parsed = v.safeParse(schema, JSON.parse(raw));
    return parsed.success ? parsed.output.slice(0, SEARCH_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
};

export const saveSearchHistory = (history: SearchHistory): string =>
  JSON.stringify(history);

export type SearchHistoryEvent =
  /** 問い合わせた。 */
  | { type: "search/searched"; query: string }
  | { type: "search/history-remove"; query: string }
  | { type: "search/history-clear" };

export const searchHistoryTransition = (
  history: SearchHistory,
  event: SearchHistoryEvent,
): SearchHistory => {
  switch (event.type) {
    case "search/searched": {
      const query = event.query.trim();
      if (query === "") return history;
      return [query, ...history.filter((entry) => entry !== query)].slice(
        0,
        SEARCH_HISTORY_LIMIT,
      );
    }
    case "search/history-remove":
      return history.filter((entry) => entry !== event.query);
    case "search/history-clear":
      return [];
  }
};

/** 履歴の 1 行を描くための区切り。人の指定は、鍵のままでは読めないので分けて返す。 */
export type SearchHistoryPart =
  | { type: "text"; text: string }
  | { type: "person"; prefix: string; pubkey: string };

export const searchHistoryParts = (query: string): SearchHistoryPart[] =>
  query
    .split(/\s+/)
    .filter((token) => token !== "")
    .map((token): SearchHistoryPart => {
      const match = /^(-?(?:from|by|to):)(.+)$/i.exec(token);
      const pubkey = match ? toPubkey(match[2]) : undefined;
      return match && pubkey
        ? { type: "person", prefix: match[1], pubkey }
        : { type: "text", text: token };
    });

/** 「検索履歴を残す」。この端末の設定で、既定は残す。 */
export const SEARCH_HISTORY_ENABLED_STORAGE_KEY =
  "streets.v1.searchHistoryEnabled";

export const loadSearchHistoryEnabled = (raw: string | null): boolean =>
  raw !== "false";

export const saveSearchHistoryEnabled = (on: boolean): string => String(on);
