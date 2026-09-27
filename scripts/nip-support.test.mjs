import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  docsPath,
  readInventory,
  renderNipSupport,
  root,
  validateInventory,
} from "./nip-support.mjs";

test("対応 NIP の一覧とドキュメントが一致する", async () => {
  const inventory = await readInventory();
  await validateInventory(inventory);
  assert.equal(await readFile(docsPath, "utf8"), renderNipSupport(inventory));
});

test("core の kind 定数に対応する NIP が一覧にある", async () => {
  const inventory = await readInventory();
  const kinds = new Set(inventory.flatMap((entry) => entry.kinds));
  const { glob } = await import("node:fs/promises");
  for await (const file of glob(path.join(root, "packages/core/src/**/*.ts"))) {
    if (file.endsWith(".test.ts")) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /\b(?:export\s+)?const\s+[A-Z][A-Z_]*_KIND\s*=\s*([\d_]+)\s*;/g,
    )) {
      const kind = Number(match[1].replaceAll("_", ""));
      assert.ok(
        kinds.has(kind),
        `${path.relative(root, file)} の kind:${kind} が一覧にない`,
      );
    }
  }
});
