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
  /** リレーが示す制限。書いていない項目は無い。 */
  limitation?: RelayLimitation;
};

export type RelayLimitation = {
  /** 1 本の接続で同時に開ける購読の数。 */
  maxSubscriptions?: number;
  /** フィルタの `limit` の上限。 */
  maxLimit?: number;
  /** 受け付けるメッセージの大きさの上限（バイト）。 */
  maxMessageLength?: number;
};

const text = v.fallback(v.optional(v.pipe(v.string(), v.trim())), undefined);

const count = v.fallback(
  v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  undefined,
);

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
  limitation: v.fallback(
    v.optional(
      v.object({
        max_subscriptions: count,
        max_limit: count,
        max_message_length: count,
      }),
    ),
    undefined,
  ),
});

export const parseRelayInfo = (json: unknown): RelayInfo | undefined => {
  const parsed = v.safeParse(schema, json);
  if (!parsed.success) return undefined;
  // 空の文字列は「書いていない」と同じに扱う。
  const { limitation, ...texts } = parsed.output;
  const info: RelayInfo = {};
  for (const [key, value] of Object.entries(texts)) {
    if (value) info[key as keyof typeof texts] = value;
  }
  const limits: RelayLimitation = {};
  if (limitation?.max_subscriptions)
    limits.maxSubscriptions = limitation.max_subscriptions;
  if (limitation?.max_limit) limits.maxLimit = limitation.max_limit;
  if (limitation?.max_message_length)
    limits.maxMessageLength = limitation.max_message_length;
  if (Object.keys(limits).length > 0) info.limitation = limits;
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
