import type { NostrEvent } from "./event";

/** 長文記事（NIP-23）。本文は Markdown。 */
export const LONG_FORM_KIND = 30_023;

export type Article = {
  pubkey: string;
  identifier: string;
  /** 題名が無い記事もある。そのときは画面側で代わりの呼び方を出す。 */
  title: string | undefined;
  summary: string | undefined;
  image: string | undefined;
  /** 最初に出した時刻（秒）。無ければ undefined（更新時刻は `updatedAt`）。 */
  publishedAt: number | undefined;
  updatedAt: number;
  hashtags: string[];
  content: string;
};

const tagValue = (event: NostrEvent, name: string): string | undefined => {
  const value = event.tags.find((tag) => tag[0] === name)?.[1]?.trim();
  return value ? value : undefined;
};

const httpUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export const parseArticle = (event: NostrEvent): Article | undefined => {
  if (event.kind !== LONG_FORM_KIND) return undefined;
  const published = Number(tagValue(event, "published_at"));
  return {
    pubkey: event.pubkey,
    identifier: event.tags.find((tag) => tag[0] === "d")?.[1] ?? "",
    title: tagValue(event, "title"),
    summary: tagValue(event, "summary"),
    image: httpUrl(tagValue(event, "image")),
    publishedAt:
      Number.isSafeInteger(published) && published > 0 ? published : undefined,
    updatedAt: event.created_at,
    hashtags: [
      ...new Set(
        event.tags
          .filter((tag) => tag[0] === "t" && tag[1])
          .map((tag) => (tag[1] as string).toLowerCase()),
      ),
    ],
    content: event.content,
  };
};

const EXCERPT_LENGTH = 140;

/**
 * カードに出す要約。`summary` が無い記事は、本文の頭から記号を落として切り出す
 * （題名しか分からないと、どんな記事かを開くまで判断できない）。
 */
export const articleExcerpt = (article: Article): string | undefined => {
  if (article.summary) return article.summary;
  const plain = article.content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/nostr:[a-z0-9]+/gi, " ")
    .replace(/[*_`~]+/g, "")
    .replace(/^\s*(?:#+|>|[-+]\s|\d+\.\s)/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain === "") return undefined;
  return plain.length > EXCERPT_LENGTH
    ? `${plain.slice(0, EXCERPT_LENGTH)}…`
    : plain;
};
