/**
 * 外へ送る文字列から、人や投稿を指すものを落とす。エラーの報告には、鍵・
 * 公開鍵・イベント id・本文のどれも要らない —— どこで何が起きたかだけが要る。
 *
 * URL にも `/npub1…` のような形が入る（ADR-0032 の一時カラム）ので、同じ形で
 * 落とす。
 */

/** bech32（NIP-19）の見出しごとに、置き換える文字。 */
const BECH32 =
  /\b(nsec|npub|nprofile|note|nevent|naddr|nrelay)1[023456789acdefghjklmnpqrstuvwxyz]{20,}/gi;

/** 64 桁の 16 進数。イベント id と公開鍵の生の形。 */
const HEX64 = /\b[0-9a-f]{64}\b/gi;

export const scrubText = (text: string): string =>
  text
    .replace(BECH32, (_, prefix: string) => `[${prefix.toLowerCase()}]`)
    .replace(HEX64, "[id]");

/**
 * URL は、どの画面かだけを残す。問い合わせ文字列と URL の断片は、何が入って
 * いるか分からないので丸ごと落とす。
 */
export const scrubUrl = (raw: string): string => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return scrubText(raw);
  }
  url.search = "";
  url.hash = "";
  return scrubText(url.toString());
};
