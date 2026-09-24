import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/**
 * ピッカーに並べる Unicode の絵文字 1 件。`[グループ番号, 絵文字, 日本語の名前, タグ, ショートコード]`。
 * 件数が多いので、キーを持たない配列にして小さくする。
 */
export type UnicodeEmojiRow = readonly [
  group: number,
  char: string,
  label: string,
  tags: readonly string[],
  shortcodes: readonly string[],
];

type CompactEmoji = {
  group?: number;
  hexcode: string;
  label: string;
  order?: number;
  tags?: string[];
  unicode: string;
};

const ID = "virtual:unicode-emojis";
const RESOLVED = `\0${ID}`;

const require = createRequire(import.meta.url);
const readJson = async <T>(specifier: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(specifier), "utf8")) as T;

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * emojibase の 2 つのファイル（合わせて 600KB）から、ピッカーが使う項目だけを
 * 取り出して 1 つにする。肌の色の違いや絵文字の番号などは使わないので落とし、
 * 並び順もここで決めておく。
 */
export const unicodeEmojis = (): Plugin => ({
  name: "streets-unicode-emojis",
  resolveId: (id) => (id === ID ? RESOLVED : undefined),
  async load(id) {
    if (id !== RESOLVED) return undefined;
    const [data, shortcodes] = await Promise.all([
      readJson<CompactEmoji[]>("emojibase-data/ja/compact.json"),
      readJson<Record<string, string | string[]>>(
        "emojibase-data/en/shortcodes/iamcal.json",
      ),
    ]);
    const rows: UnicodeEmojiRow[] = data
      .filter((entry) => entry.group !== undefined)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((entry) => [
        entry.group ?? 0,
        entry.unicode,
        entry.label,
        entry.tags ?? [],
        asArray(shortcodes[entry.hexcode]),
      ]);
    // 大きな配列は、JS のリテラルより JSON.parse のほうが速く読める。
    return `export default JSON.parse(${JSON.stringify(JSON.stringify(rows))});`;
  },
});
