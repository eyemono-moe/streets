import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasJapanese,
  parseCsv,
  placeholders,
  samePlaceholders,
  scoreText,
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
      file: "a.tsx",
      line: 1,
      column: 2,
      kind: "jsx-text",
      occurrence: 0,
      text: '1 行目、2 行目\nと "引用" を含む',
      llmLikelihood: "high",
      reason: "テスト",
      suggestedText: "",
    },
  ];
  const rows = parseCsv(toCsv(entries));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, entries[0].text);
  assert.equal(rows[0].kind, "jsx-text");
  assert.equal(rows[0].occurrence, "0");
  assert.equal(rows[0].suggestedText, "");
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

test("LLM っぽさの目安を付ける", () => {
  assert.equal(scoreText("投稿する").level, "low");
  assert.equal(scoreText("画像を添付することができます").level, "medium");
  assert.equal(scoreText("必要に応じて設定を行ってください").level, "high");
  assert.match(scoreText("画像を添付することができます").reason, /冗長/);
});
