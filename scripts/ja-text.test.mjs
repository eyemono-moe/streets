import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasJapanese,
  normalizeJsxText,
  parseCsv,
  placeholders,
  samePlaceholders,
  toCsv,
} from "./ja-text.mjs";

test("日本語を含むかを見分ける", () => {
  assert.equal(hasJapanese("投稿する"), true);
  assert.equal(hasJapanese("ノート"), true);
  assert.equal(hasJapanese("post"), false);
  assert.equal(hasJapanese("https://example.com/a.png"), false);
});

test("改行・カンマ・引用符を含む文を CSV に出して読み戻せる", () => {
  const entries = [
    {
      position: "a.tsx:1:2",
      file: "a.tsx",
      kind: "jsx-text",
      index: 0,
      text: '1 行目、2 行目\nと "引用" を含む',
    },
  ];
  const rows = parseCsv(toCsv(entries));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, entries[0].text);
  assert.equal(rows[0].position, "a.tsx:1:2");
  assert.equal(rows[0].kind, "jsx-text");
  assert.equal(rows[0].index, "0");
});

test("空の行は読み飛ばす", () => {
  const rows = parseCsv("file,text\n\na.tsx,ほん\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].file, "a.tsx");
});

test("テンプレート文字列の差し込みを数える", () => {
  assert.deepEqual(placeholders("${name} さんの ${count} 件"), [
    "name",
    "count",
  ]);
  assert.equal(samePlaceholders("${a} 件", "${a} 個"), true);
  // 差し込みが消えると、書き戻したときに中身が出なくなる。
  assert.equal(samePlaceholders("${a} 件", "いくつか"), false);
  assert.equal(samePlaceholders("${a} 件", "${b} 件"), false);
});

test("JSX の折り返しを 1 行に均す", () => {
  assert.equal(
    normalizeJsxText(
      "\n          動く画像（GIF\n          など）と動画。\n        ",
    ),
    "動く画像（GIF など）と動画。",
  );
});
