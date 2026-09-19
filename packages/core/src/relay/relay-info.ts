import * as v from "valibot";
import type { RelayUrl } from "./relay-connection";

/**
 * NIP-11 の、リレーが自分について答える情報のうち、設定の画面に出すもの。
 * 型が崩れた項目は捨て、ほかの項目は生かす —— 1 項目の誤りで全体を捨てると、
 * 名前すら出せなくなる。
 */
export type RelayInfo = {
  name?: string;
  description?: string;
  /** 管理者の公開鍵（hex）。 */
  pubkey?: string;
  contact?: string;
  icon?: string;
};

const text = v.fallback(v.optional(v.pipe(v.string(), v.trim())), undefined);

const schema = v.object({
  name: text,
  description: text,
  pubkey: v.fallback(
    v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))),
    undefined,
  ),
  contact: text,
  icon: v.fallback(
    v.optional(v.pipe(v.string(), v.url(), v.startsWith("https://"))),
    undefined,
  ),
});

export const parseRelayInfo = (json: unknown): RelayInfo | undefined => {
  const parsed = v.safeParse(schema, json);
  if (!parsed.success) return undefined;
  // 空の文字列は「書いていない」と同じに扱う。
  const info: RelayInfo = {};
  for (const [key, value] of Object.entries(parsed.output)) {
    if (value) info[key as keyof RelayInfo] = value;
  }
  return info;
};

/** NIP-11 は、リレーの URL を http(s) に読み替えた場所で答える。 */
export const relayInfoUrl = (url: RelayUrl): string =>
  url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

const TIMEOUT_MS = 5000;

/** 取れなければ undefined。答えないリレーも多いので、失敗は例外にしない。 */
export const fetchRelayInfo = async (
  url: RelayUrl,
  fetcher: typeof fetch = fetch,
): Promise<RelayInfo | undefined> => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(relayInfoUrl(url), {
      headers: { Accept: "application/nostr+json" },
      signal: abort.signal,
    });
    if (!response.ok) return undefined;
    return parseRelayInfo(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};
