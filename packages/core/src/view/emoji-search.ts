/**
 * 絵文字を言葉で絞る。日本語の名前・日本語のタグ・英語のショートコードの
 * どれでも引ける —— Slack などで `:cat:` に慣れている人がそのまま打てるように。
 */

import { normalizeForMatch as normalize } from "./text-match";

/** 引く手がかり。どこから来た絵文字でも、この形にしてから絞る。 */
export type SearchableEmoji = {
  /** 日本語の名前（カスタム絵文字にはない）。 */
  label?: string;
  /** 日本語の検索語。 */
  tags?: readonly string[];
  /** 英語のショートコード。カスタム絵文字は自分の名前がこれに当たる。 */
  shortcodes?: readonly string[];
};

/**
 * どれくらい近いか。小さいほど近い。前から一致するものを、途中で一致する
 * ものより先に出す —— 「ねこ」と打って「ねこ」より「こねこ」が先に出ると、
 * 探しているものが画面の外へ行く。
 */
const distance = (emoji: SearchableEmoji, needle: string): number => {
  let best = Number.POSITIVE_INFINITY;
  const check = (value: string, bonus: number) => {
    const index = normalize(value).indexOf(needle);
    if (index < 0) return;
    best = Math.min(best, index * 2 + bonus);
  };
  // ショートコードは打つ人が狙って打つものなので、名前やタグより先に出す。
  for (const shortcode of emoji.shortcodes ?? []) check(shortcode, 0);
  if (emoji.label !== undefined) check(emoji.label, 1);
  for (const tag of emoji.tags ?? []) check(tag, 1);
  return best;
};

/**
 * 近い順に並べ替えて返す。打っていない（空の）ときは、渡された並びのまま
 * 全部返す。
 */
export const searchEmojis = <T extends SearchableEmoji>(
  emojis: readonly T[],
  query: string,
): T[] => {
  const needle = normalize(query.trim());
  if (needle === "") return [...emojis];
  const scored: { emoji: T; score: number; order: number }[] = [];
  emojis.forEach((emoji, order) => {
    const score = distance(emoji, needle);
    if (score === Number.POSITIVE_INFINITY) return;
    scored.push({ emoji, score, order });
  });
  // 同じ近さなら元の並び（絵文字の標準の並び順）を保つ。
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.map((entry) => entry.emoji);
};
