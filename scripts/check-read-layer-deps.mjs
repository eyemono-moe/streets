#!/usr/bin/env node
/**
 * v1 読み取り層が旧実装や高水準 Nostr ライブラリに依存していないことを検査する。
 *
 * ADR-0020 は Nostr ライブラリへの依存を禁じ、ADR-0014 は読み取り層を旧
 * transport/query/repository/view/store から切り離した。この制約はこれまで
 * 人間とサブエージェントへの指示で担保されていたが、指示は忘れられる。
 *
 * 新旧のコードが同じディレクトリに同居している箇所があるため
 * (src/core/nostr, src/core/solid)、ディレクトリ単位では判定できない。
 * 新しい側のファイルを明示的に列挙する。旧実装を消し終えたら
 * (実装計画の後続計画 #8)、この列挙は単純なディレクトリ指定に畳める。
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** 読み取り層に属するファイル。ディレクトリ末尾 "/" は再帰。 */
const READ_LAYER = [
  "src/core/read/",
  "src/core/relay/",
  "src/core/nostr/event.ts",
  "src/core/nostr/event.test.ts",
  "src/core/nostr/nip19.ts",
  "src/core/nostr/nip19.test.ts",
  "src/core/solid/create-section.ts",
  "src/core/solid/create-section.test.tsx",
  "src/routes/debug/v1-section.tsx",
];

const BANNED_PACKAGES = [
  "nostr-tools",
  "rx-nostr",
  "rx-nostr-crypto",
  "@rust-nostr/nostr-sdk",
  "nostr-typedef",
  "nip07-awaiter",
];

const BANNED_PATH_SEGMENTS = [
  "core/transport",
  "core/query",
  "core/repository",
  "core/view",
  "core/store",
];

const collect = async (entry) => {
  if (!entry.endsWith("/")) return [entry];
  const dirents = await readdir(join(ROOT, entry), {
    withFileTypes: true,
    recursive: true,
  });
  return dirents
    .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
    .map((d) => relative(ROOT, join(d.parentPath ?? d.path, d.name)));
};

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;

const violations = [];

for (const entry of READ_LAYER) {
  for (const file of await collect(entry)) {
    let source;
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      violations.push(`${file}: listed in READ_LAYER but not found`);
      continue;
    }
    for (const [, specifier] of source.matchAll(IMPORT_RE)) {
      const banned =
        BANNED_PACKAGES.find(
          (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
        ) ?? BANNED_PATH_SEGMENTS.find((seg) => specifier.includes(seg));
      if (banned)
        violations.push(`${file}: imports "${specifier}" (${banned})`);
    }
  }
}

if (violations.length > 0) {
  console.error("v1 読み取り層が禁止された依存を持っています:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nADR-0014 / ADR-0020 を参照。旧実装と高水準 Nostr ライブラリは読み取り層から使わない。",
  );
  process.exit(1);
}

console.log(`read layer deps ok (${READ_LAYER.length} entries checked)`);
