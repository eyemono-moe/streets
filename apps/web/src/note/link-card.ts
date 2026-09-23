import type { LinkCardMode } from "@streets/core/deck/deck";
import { createQuery } from "@tanstack/solid-query";
import { type Accessor, createContext, useContext } from "solid-js";
import * as v from "valibot";

const linkCardSchema = v.object({
  url: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  siteName: v.optional(v.string()),
});

export type LinkCard = v.InferOutput<typeof linkCardSchema>;

const responseSchema = v.object({ card: v.nullable(linkCardSchema) });

/** 取得口（workers/app の /api/link-card）が返した答えを読む。 */
export const fetchLinkCard = async (url: string): Promise<LinkCard | null> => {
  const response = await fetch(`/api/link-card?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`link card: ${response.status}`);
  return v.parse(responseSchema, await response.json()).card;
};

export const linkCardQueryKey = (url: string) => ["link-card", url] as const;

/**
 * 同じ URL の取得は画面全体で 1 回にまとめる。取得口が 1 日キャッシュするので、
 * こちらも 1 日は取り直さない（既定の staleTime）。取れなかったこと（null）も
 * 答えとして持ち、同じリンクを何度も聞きに行かない。回数の上限（429）などの
 * 失敗は、取れなかったものとして扱い、繰り返さない。
 */
export const useLinkCard = (url: Accessor<string>) =>
  createQuery(() => ({
    queryKey: linkCardQueryKey(url()),
    queryFn: () => fetchLinkCard(url()),
    retry: false,
  }));

/** カラムの設定。カラムの外（入口など）では小さなカードにする。 */
const LinkCardModeContext = createContext<LinkCardMode>("compact");
export const LinkCardModeProvider = LinkCardModeContext.Provider;
export const useLinkCardMode = () => useContext(LinkCardModeContext);
