import { bech32 } from "@scure/base";
import * as v from "valibot";

/** LNURL は長い URL を入れるので、bech32 の既定の上限（90 文字）では足りない。 */
const LIMIT = 2000;

/** Zap を送る先。LNURL-pay の問い合わせ先と、Zap の依頼の `lnurl` タグに入れる値。 */
export type ZapEndpoint = {
  /** LNURL-pay の情報を問い合わせる URL（https）。 */
  url: string;
  /** その URL を bech32 にしたもの（`lnurl1…`）。 */
  lnurl: string;
};

const encodeLnurl = (url: string): string =>
  bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode(url)), LIMIT);

const httpsUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    // .onion など http でしか届かない先は、ブラウザから払えないので扱わない。
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** `name@domain` の形（LUD-16）を、LNURL-pay の問い合わせ先にする。 */
const fromLightningAddress = (address: string): ZapEndpoint | undefined => {
  const match = /^([a-z0-9._-]+)@([^\s@/]+\.[^\s@/]+)$/i.exec(address.trim());
  if (!match) return undefined;
  const [, name = "", domain = ""] = match;
  const url = httpsUrl(
    `https://${domain.toLowerCase()}/.well-known/lnurlp/${name.toLowerCase()}`,
  );
  return url ? { url, lnurl: encodeLnurl(url) } : undefined;
};

/** `lnurl1…`（LUD-06）を、LNURL-pay の問い合わせ先にする。 */
const fromLnurl = (value: string): ZapEndpoint | undefined => {
  try {
    const { prefix, words } = bech32.decode(
      value.trim().toLowerCase() as `${string}1${string}`,
      LIMIT,
    );
    if (prefix !== "lnurl") return undefined;
    const url = httpsUrl(new TextDecoder().decode(bech32.fromWords(words)));
    return url ? { url, lnurl: value.trim().toLowerCase() } : undefined;
  } catch {
    return undefined;
  }
};

const lightningFields = v.looseObject({
  lud16: v.fallback(v.optional(v.string()), undefined),
  lud06: v.fallback(v.optional(v.string()), undefined),
});

/**
 * プロフィール（kind:0 の content）から Zap の送り先を読む。`lud16` を優先し、
 * 読めなければ `lud06` を使う。どちらも無い・読めないときは Zap を送れない。
 */
export const zapEndpointOf = (
  profileContent: string | undefined,
): ZapEndpoint | undefined => {
  if (!profileContent) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(profileContent);
  } catch {
    return undefined;
  }
  const fields = v.safeParse(lightningFields, json);
  if (!fields.success) return undefined;
  const { lud16, lud06 } = fields.output;
  return (
    (lud16 ? fromLightningAddress(lud16) : undefined) ??
    (lud06 ? fromLnurl(lud06) : undefined)
  );
};

const payInfoSchema = v.object({
  tag: v.literal("payRequest"),
  callback: v.pipe(v.string(), v.url()),
  minSendable: v.pipe(v.number(), v.integer(), v.minValue(1)),
  maxSendable: v.pipe(v.number(), v.integer(), v.minValue(1)),
  allowsNostr: v.optional(v.boolean()),
  nostrPubkey: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))),
  commentAllowed: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

/** LNURL-pay の情報のうち、Zap に使うもの。金額はミリサトシ。 */
export type ZapPayInfo = {
  callback: string;
  minSendable: number;
  maxSendable: number;
  /** Zap の受領（kind:9735）に署名する鍵。受領が本物かをこれで確かめる。 */
  nostrPubkey: string;
  /** LNURL の comment に入れられる文字数。0 なら入れない。 */
  commentAllowed: number;
};

/**
 * LNURL-pay の答えを読む。Nostr の Zap を受け付けない（`allowsNostr` が無い、
 * 受領に署名する鍵が無い）送り先は、ただの支払いになり受領が届かないので扱わない。
 */
export const parseZapPayInfo = (json: unknown): ZapPayInfo | undefined => {
  const result = v.safeParse(payInfoSchema, json);
  if (!result.success) return undefined;
  const info = result.output;
  if (info.allowsNostr !== true || !info.nostrPubkey) return undefined;
  if (httpsUrl(info.callback) === undefined) return undefined;
  if (info.minSendable > info.maxSendable) return undefined;
  return {
    callback: info.callback,
    minSendable: info.minSendable,
    maxSendable: info.maxSendable,
    nostrPubkey: info.nostrPubkey,
    commentAllowed: info.commentAllowed ?? 0,
  };
};
