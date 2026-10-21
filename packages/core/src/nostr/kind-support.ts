import type { Locale } from "../settings/locale-setting";
import { normalizeForMatch } from "../view/text-match";
import inventory from "./kind-support.json";

export type KindSupport = {
  kind: number;
  status: "表示対応" | "内部利用" | "未対応";
  /** 日本語の名前。「Streets について」と docs/nips.md もこれを出す。 */
  summary: string;
  summaryEn: string;
};

/** Event での表示対応と、画面に出さない内部利用を区別する。 */
export const KIND_SUPPORT: KindSupport[] = inventory as KindSupport[];

/** 一覧にある kind の、その言語での名前。 */
export const kindSummary = (entry: KindSupport, locale: Locale): string =>
  locale === "en" ? entry.summaryEn : entry.summary;

/**
 * 一覧にある kind の名前。一覧に無ければ `undefined`（呼ぶ側が、知らない kind の
 * 呼び方を決める）。
 */
export const kindName = (kind: number, locale: Locale): string | undefined => {
  const entry = KIND_SUPPORT.find((known) => known.kind === kind);
  return entry && kindSummary(entry, locale);
};

/**
 * 打った言葉に合う kind を、近い順に。数字なら番号の頭で、それ以外は呼び名で
 * 引く。何も打っていなければ、画面で描ける kind だけを出す —— 内部で使うだけの
 * kind（フォローリストなど）を探しても、並ぶ投稿が無い。
 */
export const findKinds = (query: string): KindSupport[] => {
  const needle = normalizeForMatch(query.trim());
  if (needle === "") {
    return KIND_SUPPORT.filter((entry) => entry.status === "表示対応");
  }
  const score = (entry: KindSupport): number | undefined => {
    if (/^\d+$/.test(needle)) {
      const number = String(entry.kind);
      if (number === needle) return 0;
      return number.startsWith(needle) ? 1 : undefined;
    }
    // どちらの言語で打っても引けるようにする。
    const indexes = [entry.summary, entry.summaryEn]
      .map((name) => normalizeForMatch(name).indexOf(needle))
      .filter((index) => index >= 0);
    if (indexes.length === 0) return undefined;
    return Math.min(...indexes) === 0 ? 0 : 1;
  };
  return KIND_SUPPORT.flatMap((entry) => {
    const found = score(entry);
    return found === undefined ? [] : [{ entry, found }];
  })
    .sort((a, b) => a.found - b.found || a.entry.kind - b.entry.kind)
    .map(({ entry }) => entry);
};
