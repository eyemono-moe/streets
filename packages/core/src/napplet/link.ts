/*
 * NAP-LINK（napplet/naps PR #53）。アップレットに頼まれて、外のページを開く。
 *
 * > The shell MUST reject relative URLs.
 * > The shell MUST reject `javascript:`, `data:`, `blob:`, `file:`, and other local or
 * > code-bearing schemes.
 * > The shell MAY support non-web schemes such as `nostr:` or `mailto:` by policy.
 */
import { decodeNip19 } from "../nostr/nip19";

export type LinkTarget =
  | { type: "web"; url: string; hostname: string }
  /** `nostr:` の後ろ。Streets のカラムで開く。 */
  | { type: "nostr"; entity: string };

export type LinkError = "invalid-url" | "unsupported-scheme";

export const parseLinkUrl = (
  raw: unknown,
): { ok: true; target: LinkTarget } | { ok: false; error: LinkError } => {
  if (typeof raw !== "string") return { ok: false, error: "invalid-url" };
  let url: URL;
  try {
    // 基準を渡さないので、相対の URL はここで例外になる。
    url = new URL(raw);
  } catch {
    return { ok: false, error: "invalid-url" };
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    if (!url.hostname) return { ok: false, error: "invalid-url" };
    // hostname は URL が punycode に直したもの。見た目の似た文字の国際化ドメインを、
    // 確認の画面で別物と分かるように出す。
    return {
      ok: true,
      target: { type: "web", url: url.href, hostname: url.hostname },
    };
  }
  if (url.protocol === "nostr:") {
    const entity = raw.slice("nostr:".length);
    return decodeNip19(entity)
      ? { ok: true, target: { type: "nostr", entity } }
      : { ok: false, error: "invalid-url" };
  }
  return { ok: false, error: "unsupported-scheme" };
};
