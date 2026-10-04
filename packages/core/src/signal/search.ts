import { normalizeForMatch } from "../view/text-match";

/** 設定・操作・案内に共通する、ローカル検索用の情報。 */
export type SearchEntry = {
  id: string;
  title: string;
  description?: string;
  section?: string;
  keywords?: readonly string[];
  aliases?: readonly string[];
  shortcodes?: readonly string[];
};

export type SearchHit<T extends SearchEntry> = { entry: T; score: number };

const matchField = (value: string, term: string, weight: number): number => {
  const normalized = normalizeForMatch(value);
  if (normalized === term) return weight + 80;
  if (normalized.startsWith(term)) return weight + 50;
  if (normalized.includes(term)) return weight + 20;
  // 短い語の部分列一致は「か」などで無関係な項目を大量に拾う。
  if (term.length < 3) return 0;
  let at = 0;
  let gaps = 0;
  for (const character of term) {
    const found = normalized.indexOf(character, at);
    if (found === -1) return 0;
    gaps += found - at;
    at = found + 1;
  }
  return Math.max(1, weight - 80 - gaps);
};

const bestScore = (entry: SearchEntry, term: string): number =>
  Math.max(
    matchField(entry.title, term, 600),
    ...(entry.shortcodes ?? []).map((value) => matchField(value, term, 650)),
    ...(entry.aliases ?? []).map((value) => matchField(value, term, 480)),
    ...(entry.keywords ?? []).map((value) => matchField(value, term, 360)),
    entry.section ? matchField(entry.section, term, 240) : 0,
    entry.description ? matchField(entry.description, term, 120) : 0,
  );

/** すべての語に一致する候補を、関連度順・同点では元の順に返す。 */
export const searchEntries = <T extends SearchEntry>(
  entries: readonly T[],
  query: string,
): SearchHit<T>[] => {
  const terms = query
    .trim()
    .split(/\s+/)
    .map(normalizeForMatch)
    .filter(Boolean);
  if (terms.length === 0) return [];
  return entries
    .map((entry, index) => ({
      entry,
      index,
      scores: terms.map((term) => bestScore(entry, term)),
    }))
    .filter(({ scores }) => scores.every((score) => score > 0))
    .map(({ entry, index, scores }) => ({
      entry,
      index,
      score: scores.reduce((sum, score) => sum + score, 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry, score }) => ({ entry, score }));
};
