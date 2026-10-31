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
  // 本体の head を探すと、コメント・文字列・template の中へ差し込んでしまう。
  // 先頭のコメントと doctype だけを残し、ブラウザに本体の html の属性を引き継がせる。
  // `<!-->`・`<!--->` は直ちに閉じるので、後続のスクリプトまでコメント扱いしない。
  // 巨大な属性列を正規表現で追うとスタックを使い切るので、保持するヘッダーだけを絞る。
  const header = html.slice(0, 64 * 1024);
  const prefix =
    /^[\t\n\f\r ]*(?:<!--(?!>|->)(?:(?!--!?>)[\s\S])*--!?>[\t\n\f\r ]*)*(?:<!doctype[^>]*>)?/i.exec(
      header,
    );
  const at = prefix?.[0].length ?? 0;
  const rest = header.slice(at);
  // 本体の先頭に本物の head がある場合だけ、属性も残してその中へ差し込む。
  const trivia = String.raw`[\t\n\f\r ]*(?:<!--(?!>|->)(?:(?!--!?>)[\s\S])*--!?>[\t\n\f\r ]*)*`;
  const attributes = String.raw`(?:[\t\n\f\r ]+[^\t\n\f\r "'<>/=\x60]+(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"[^"]*"|'[^']*'|[^\t\n\f\r "'=<>\x60]+))?)*[\t\n\f\r ]*`;
  const head = new RegExp(
    `^${trivia}(?:<html${attributes}>${trivia})?<head${attributes}>`,
    "i",
  ).exec(rest);
  if (head) {
    const end = at + head[0].length;
    return html.slice(0, end) + injected + html.slice(end);
  }
  return `${html.slice(0, at)}<head>${injected}</head>${html.slice(at)}`;
};
