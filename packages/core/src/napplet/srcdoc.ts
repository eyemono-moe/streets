/*
 * 照合した本体に、CSP と `window.napplet` を差し込む。
 *
 * > Because a `srcdoc` document has no HTTP response on which to carry a Content Security Policy
 * > header, shells SHOULD inject a CSP `meta` element as the first element in `head`, before any
 * > napplet-controlled resource or script is parsed. The shell MUST inject the policy only after
 * > verifying the signed artifact bytes, and the injected policy MUST remain outside the bytes used
 * > to compute `artifactHash`.
 */
import { nappletPrelude } from "./prelude";

/** NIP-5D が挙げる基本形。napplet は外へ直に通信せず、すべてランチャーを通す。 */
export const NAPPLET_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; child-src 'none'; " +
  "frame-src 'none'; media-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; " +
  "form-action 'none'";

// `</script>` が JSON の中に出ても、差し込んだ script をそこで閉じさせない。
const escapeScript = (source: string): string =>
  source.replace(/<\/(script)/gi, "<\\/$1");

export const prepareNappletSrcdoc = (
  html: string,
  domains: readonly string[],
): string => {
  const injected =
    `<meta http-equiv="Content-Security-Policy" content="${NAPPLET_CSP}">` +
    `<script>${escapeScript(nappletPrelude(domains))}</script>`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + injected + html.slice(at);
  }
  const root = /<html(?:\s[^>]*)?>/i.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return `${html.slice(0, at)}<head>${injected}</head>${html.slice(at)}`;
  }
  // doctype より前に置くと互換モードで描かれるので、doctype の後に置く。
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return `${html.slice(0, at)}<head>${injected}</head>${html.slice(at)}`;
};
