/** ほかのアプリの共有メニューから届いた文字（Web Share Target の title・text・url）。 */
export type SharedFields = {
  title?: string;
  text?: string;
  url?: string;
};

const BARE_URL = /^https?:\/\/\S+$/;

/**
 * 共有された文字から、投稿欄に入れる本文を作る。
 *
 * Android のアプリの多くは URL を `url` ではなく `text` に入れて送る。`title` は
 * ページの題で、選んだ文を共有したときにも付いてくるので、`text` が URL だけ
 * （か空）のときにだけ使う。
 */
export const sharedText = (fields: SharedFields): string => {
  const title = fields.title?.trim() ?? "";
  const text = fields.text?.trim() ?? "";
  const url = fields.url?.trim() ?? "";
  const lines: string[] = [];
  if (title && (text === "" || BARE_URL.test(text)) && !text.includes(title)) {
    lines.push(title);
  }
  if (text) lines.push(text);
  if (url && !text.includes(url)) lines.push(url);
  return lines.join("\n");
};
