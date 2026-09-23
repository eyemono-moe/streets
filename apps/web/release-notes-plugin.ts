import { Marked } from "marked";
import type { Plugin } from "vite";

/** 画面に渡すリリースノート。本文は HTML にしてある。 */
export type ReleaseNote = { version: string; date?: string; html: string };

const FILE = /\/(v\d+\.\d+\.\d+(?:-[\w.]+)?)\.md\?release-note$/;

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** 本文の中の `nostr:npub1…` / `nostr:nprofile1…`（NIP-21）。 */
const NOSTR_USER = /^nostr:((?:npub|nprofile)1[02-9ac-hj-np-z]+)/;

// ノートの本文はリポジトリのファイル（PR でレビューしたもの）なので、そのまま HTML にする。
const marked = new Marked({
  gfm: true,
  extensions: [
    {
      // 人の参照は目印の要素にし、画面が投稿と同じ名前の表示に差し替える
      // （bech32 の解読も画面で行う）。差し替えるまでは参照の文字列のまま出る。
      name: "nostrUser",
      level: "inline",
      start: (source) => source.indexOf("nostr:"),
      tokenizer(source) {
        const match = NOSTR_USER.exec(source);
        return match?.[1]
          ? { type: "nostrUser", raw: match[0], ref: match[1] }
          : undefined;
      },
      renderer: (token) =>
        `<span data-nostr-user="${escapeAttribute(token.ref)}">${token.ref.slice(0, 12)}…</span>`,
    },
  ],
  renderer: {
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** 先頭の `---` で囲んだ部分から `date:` を読む。無ければ本文だけ。 */
const splitFrontMatter = (source: string): { date?: string; body: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { body: source };
  const date = /^date:\s*(\S+)\s*$/m.exec(match[1] ?? "")?.[1];
  return { ...(date ? { date } : {}), body: source.slice(match[0].length) };
};

/**
 * `import.meta.glob("./releases/v*.md", { query: "?release-note" })` で読んだ
 * リリースノートを、版の番号・日付・HTML の本文にする。変換はビルドのときに済ませ、
 * 画面は Markdown を読まない。
 */
export const releaseNotes = (): Plugin => ({
  name: "streets-release-notes",
  enforce: "pre",
  transform(source, id) {
    const version = FILE.exec(id)?.[1];
    if (!version) return undefined;
    const { date, body } = splitFrontMatter(source);
    const note: ReleaseNote = {
      version,
      ...(date ? { date } : {}),
      html: marked.parse(body, { async: false }),
    };
    return { code: `export default ${JSON.stringify(note)};`, map: null };
  },
});
