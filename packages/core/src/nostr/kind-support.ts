import { normalizeForMatch } from "../view/text-match";
import inventory from "./kind-support.json";

export type KindSupport = {
  kind: number;
  status: "表示対応" | "内部利用" | "未対応";
  summary: string;
};

/** Event での表示対応と、画面に出さない内部利用を区別する。 */
export const KIND_SUPPORT: KindSupport[] = inventory as KindSupport[];

/**
 * 「○○さんの<これ>」と呼ぶときの kind の名前。知らない kind を「投稿」と呼ぶと
 * 別物を投稿と偽るので、汎用の呼び名にする。
 */
export const kindLabel = (kind: number): string =>
  KIND_SUPPORT.find((entry) => entry.kind === kind)?.summary ?? "イベント";

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
    const index = normalizeForMatch(entry.summary).indexOf(needle);
    if (index < 0) return undefined;
    return index === 0 ? 0 : 1;
  };
  return KIND_SUPPORT.flatMap((entry) => {
    const found = score(entry);
    return found === undefined ? [] : [{ entry, found }];
  })
    .sort((a, b) => a.found - b.found || a.entry.kind - b.entry.kind)
    .map(({ entry }) => entry);
};
