import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

/**
 * 読み取り層の段と、段の間で許す import の向き。README の図と同じもの。
 * ファイル名から段を決める。表に無いファイルが増えたら落ちるので、足すときに段を選ぶ。
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
  // relay/ は全体でひとつの段。どの段からも読める（接続の型を渡すため）。
  socket: [],
} as const;

type Layer = keyof typeof LAYERS;

/** 同じ段の中はいつでも読める。ここに書くのは別の段への向きだけ。 */
const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
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

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const layerByFile = new Map<string, Layer>();
for (const [layer, files] of Object.entries(LAYERS) as [
  Layer,
  readonly string[],
][]) {
  for (const file of files) layerByFile.set(file, layer);
}

const layerOf = (file: string): Layer | undefined =>
  file.startsWith("relay/") ? "socket" : layerByFile.get(file);

const listSources = (dir: string): string[] =>
  readdirSync(join(srcDir, dir))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `${dir}/${name}`);

const importsOf = (file: string): string[] => {
  const text = readFileSync(join(srcDir, file), "utf8");
  const resolved: string[] = [];
  for (const match of text.matchAll(/(?:from|import\()\s*"(\.[^"]*)"/g)) {
    const target = relative(srcDir, join(srcDir, dirname(file), match[1]));
    resolved.push(`${target.replaceAll("\\", "/")}.ts`);
  }
  return resolved;
};

describe("読み取り層の依存の向き", () => {
  const files = [...listSources("read"), ...listSources("relay")];

  it("read/ と relay/ のファイルはすべて段が決まっている", () => {
    const missing = files.filter((file) => layerOf(file) === undefined);
    expect(missing).toEqual([]);
  });

  it("表にあるファイルは実在する", () => {
    const existing = new Set([...files, CREATE_SECTION]);
    const stale = [...layerByFile.keys()].filter((file) => !existing.has(file));
    expect(stale).toEqual([]);
  });

  it("import は同じ段か、許した下の段へ向かう", () => {
    const violations: string[] = [];
    for (const file of [...files, CREATE_SECTION]) {
      const from = layerOf(file);
      if (from === undefined) continue;
      for (const target of importsOf(file)) {
        const to = layerOf(target);
        if (to === undefined) {
          const outside = OUTSIDE_ALLOWED.some((prefix) =>
            target.startsWith(prefix),
          );
          // 読み口（createSection）は solid の層なので、solid 内の相手は見ない。
          if (!outside && file !== CREATE_SECTION) {
            violations.push(`${file} -> ${target} (読み取り層の外)`);
          }
          continue;
        }
        if (to === from || to === "socket") continue;
        if (!MAY_IMPORT[from].includes(to)) {
          violations.push(`${file} (${from}) -> ${target} (${to})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
