import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC = new URL("../apps/web/src/", import.meta.url).pathname;
const REGISTRY = join(SRC, "i18n/dictionaries.ts");

/** `<フォルダ>/i18n/` を持つフォルダ（src からの相対）を集める。 */
const namespaceDirs = (dir = SRC) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(dir, entry.name);
    if (entry.name === "i18n") {
      return path === join(SRC, "i18n") ? [] : [relative(SRC, dir)];
    }
    return namespaceDirs(path);
  });

const read = (dir, locale) =>
  JSON.parse(readFileSync(join(SRC, dir, "i18n", `${locale}.json`), "utf8"));

/** 文言の末端ごとの、キーの道と、埋める名前。検索の語のような配列は 1 つの末端とみなす。 */
const leaves = (node, path = []) =>
  typeof node === "object" && node !== null && !Array.isArray(node)
    ? Object.entries(node).flatMap(([key, value]) =>
        leaves(value, [...path, key]),
      )
    : [
        [
          path.join("."),
          [...String(node).matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
            .map((match) => match[1])
            .sort((a, b) => a.localeCompare(b))
            .join(","),
        ],
      ];

const dirs = namespaceDirs();

test("文言のフォルダがある", () => {
  assert.ok(dirs.length > 0);
});

for (const dir of dirs) {
  test(`${dir}: 日本語と英語が同じキーを持つ`, () => {
    assert.ok(existsSync(join(SRC, dir, "i18n", "en.json")));
    const ja = new Map(leaves(read(dir, "ja")));
    const en = new Map(leaves(read(dir, "en")));
    assert.deepEqual(
      [...en.keys()].sort((a, b) => a.localeCompare(b)),
      [...ja.keys()].sort((a, b) => a.localeCompare(b)),
    );
    for (const [key, params] of ja) {
      assert.equal(en.get(key), params, `${key} の {{ }} が食い違う`);
    }
  });

  test(`${dir}: 辞書に、フォルダの名前で登録してある`, () => {
    const registry = readFileSync(REGISTRY, "utf8");
    const namespace = dir.replaceAll("/", ".");
    for (const locale of ["ja", "en"]) {
      const imported = registry.match(
        new RegExp(`import (\\w+) from "\\.\\./${dir}/i18n/${locale}\\.json";`),
      );
      assert.ok(imported, `${dir}/i18n/${locale}.json を読んでいない`);
      assert.match(
        registry,
        new RegExp(`(?:"${namespace}"|\\b${namespace}): ${imported[1]},`),
        `${imported[1]} を ${namespace} として登録していない`,
      );
    }
  });
}
