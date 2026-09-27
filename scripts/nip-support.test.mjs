import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  docsPath,
  readInventory,
  readKindInventory,
  renderNipSupport,
  root,
  validateInventory,
  validateKindInventory,
} from "./nip-support.mjs";

test("対応 NIP の一覧とドキュメントが一致する", async () => {
  const inventory = await readInventory();
  const kinds = await readKindInventory();
  await validateInventory(inventory);
  validateKindInventory(inventory, kinds);
  assert.equal(
    await readFile(docsPath, "utf8"),
    renderNipSupport(inventory, kinds),
  );
});

test("表示対応の kind は Event の分岐で専用表示される", async () => {
  const kinds = await readKindInventory();
  const source = await readFile(
    path.join(root, "apps/web/src/note/Event.tsx"),
    "utf8",
  );
  const dispatch = source.slice(
    source.indexOf("const EventContent:"),
    source.indexOf("const StandardEvent:"),
  );
  assert.ok(dispatch.startsWith("const EventContent:"));
  assert.ok(dispatch.includes("const EventBody:"));
  const rendered = new Set(
    [...dispatch.matchAll(/<Match\s+when=\{([^}]+)\}/g)].flatMap((match) =>
      [...match[1].matchAll(/props\.event\.kind === (\d+)/g)].map((kind) =>
        Number(kind[1]),
      ),
    ),
  );
  const declared = new Set(
    kinds
      .filter((entry) => entry.status === "表示対応")
      .map((entry) => entry.kind),
  );
  assert.deepEqual(rendered, declared);
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
