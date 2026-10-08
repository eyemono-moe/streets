import path from "node:path";
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

/**
 * 読み取り層の段と、段の間で許す import の向き。`packages/core/README.md` の図と同じもの。
 * テストではなく lint の規則にしているのは、import を書いたその場でエディタに出すため。
 */
const LAYERS = {
  compose: ["read/read-layer.ts"],
  reader: [
    "read/lookups.ts",
    "read/section-reader.ts",
    "solid/create-section.ts",
  ],
  batcher: [
    "read/batched-fetch.ts",
    "read/address-requests.ts",
    "read/engagement-requests.ts",
    "read/event-requests.ts",
    "read/follow-list-requests.ts",
    "read/poll-requests.ts",
    "read/profile-requests.ts",
  ],
  ledger: [
    "read/subscription-manager.ts",
    "read/collect.ts",
    "read/older-page.ts",
    "read/newer-page.ts",
  ],
  warmup: ["read/bootstrap.ts"],
  planner: [
    "read/read-planner.ts",
    "read/query-plan.ts",
    "read/read-plan.ts",
    "read/read-routing.ts",
    "read/relay-selector.ts",
  ],
  pool: ["read/connection-pool.ts", "read/relay-session.ts"],
  store: [
    "read/event-store.ts",
    "read/event-persistence.ts",
    "read/indexeddb-persistence.ts",
    "read/signature-gate.ts",
    "read/cache-policy.ts",
    "read/routing-table.ts",
    "read/relay-list.ts",
    "read/seen-relays.ts",
  ],
  base: [
    "read/scheduler.ts",
    "read/fake-clock.ts",
    "read/default-relays.ts",
    "read/filter-match.ts",
    "read/sorted-events.ts",
    "read/source.ts",
  ],
  // relay/ は全体でひとつの段。接続の型を渡すので、どの段からも読める。
  socket: [],
};

/** 同じ段の中はいつでも読める。書くのは別の段への向きだけ。 */
const MAY_IMPORT = {
  compose: [
    "reader",
    "batcher",
    "ledger",
    "warmup",
    "planner",
    "pool",
    "store",
    "base",
  ],
  reader: ["batcher", "ledger", "store", "base"],
  batcher: ["ledger", "store", "base"],
  ledger: ["planner", "pool", "store", "base"],
  warmup: ["ledger", "pool", "store", "base"],
  planner: ["base"],
  pool: ["base"],
  store: ["base"],
  base: [],
  socket: [],
};

/** read/ と relay/ が外へ出てよい先。`write/`・`deck/` などの上の層へは出ない。 */
const OUTSIDE_ALLOWED = ["nostr/", "signer/"];

const CREATE_SECTION = "solid/create-section.ts";

const layerByFile = new Map(
  Object.entries(LAYERS).flatMap(([layer, files]) =>
    files.map((file) => [file, layer]),
  ),
);

/** `packages/core/src` から見たパス。core の外なら undefined。 */
export const coreRelative = (filename) => {
  const marker = `${path.sep}packages${path.sep}core${path.sep}src${path.sep}`;
  const index = filename.lastIndexOf(marker);
  if (index === -1) return undefined;
  return filename.slice(index + marker.length).replaceAll(path.sep, "/");
};

export const layerOf = (file) =>
  file.startsWith("relay/") ? "socket" : layerByFile.get(file);

const isLayered = (file) =>
  (file.startsWith("read/") || file.startsWith("relay/")) &&
  file.endsWith(".ts") &&
  !file.endsWith(".test.ts");

/** 守られていれば undefined、破っていれば理由。 */
export const checkImport = (file, specifier) => {
  if (!specifier.startsWith(".")) return undefined;
  const from = layerOf(file);
  if (from === undefined) return undefined;
  const target = `${path.posix.join(path.posix.dirname(file), specifier)}.ts`;
  const to = layerOf(target);
  if (to === undefined) {
    // createSection は solid/ の層なので、solid/ の中の相手は見ない。
    if (file === CREATE_SECTION) return undefined;
    if (OUTSIDE_ALLOWED.some((prefix) => target.startsWith(prefix))) {
      return undefined;
    }
    return `${file} は読み取り層の外の ${target} を読めない`;
  }
  if (to === from || to === "socket") return undefined;
  if (MAY_IMPORT[from].includes(to)) return undefined;
  return `${from} の段（${file}）は ${to} の段（${target}）を読めない`;
};

export const checkFile = (file) =>
  isLayered(file) && layerOf(file) === undefined
    ? `${file} の段が決まっていない。scripts/read-layers.mjs の表に足す`
    : undefined;

const readLayersRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "読み取り層の段の間の import の向きを守る" },
  },
  createOnce(context) {
    let file;
    const check = (source) => {
      if (file === undefined || typeof source?.value !== "string") return;
      const message = checkImport(file, source.value);
      if (message) context.report({ node: source, message });
    };
    return {
      Program(node) {
        file = coreRelative(context.filename);
        if (file === undefined) return;
        const message = checkFile(file);
        if (message) context.report({ node, message });
      },
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
});

export default definePlugin({
  meta: { name: "streets" },
  rules: { "read-layers": readLayersRule },
});
