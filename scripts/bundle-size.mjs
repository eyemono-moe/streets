/**
 * ビルドした apps/web/dist の JS・CSS の大きさを測り、2 つを比べて Markdown にする。
 * PR ごとに main と比べ、起動時に読む量が増えていないかを見る（.github/workflows/bundle-size.yaml）。
 *
 *   node scripts/bundle-size.mjs measure apps/web/dist > head.json
 *   node scripts/bundle-size.mjs compare base.json head.json > comment.md
 *
 * 大きさは brotli で縮めた後のバイト数。配るときに縮めるので、元の大きさより体感に近い。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";

/** `index-OaQoKUnL.js` → `index.js`。ハッシュは中身が変わるたびに変わるので、名前で突き合わせる。 */
export const chunkName = (file) => file.replace(/-[\w-]{8}(\.\w+)$/, "$1");

/** index.html が最初に読むファイル（入口のスクリプト・modulepreload・スタイルシート）。 */
export const initialFiles = (html) => {
  const files = new Set();
  for (const [, url] of html.matchAll(
    /<(?:script|link)\b[^>]*?(?:src|href)="\/assets\/([^"]+)"/g,
  )) {
    files.add(url);
  }
  return files;
};

/** @returns {{ chunks: Record<string, { bytes: number, initial: boolean }> }} */
export const measure = (dist) => {
  const initial = initialFiles(readFileSync(join(dist, "index.html"), "utf8"));
  /** @type {Record<string, { bytes: number, initial: boolean }>} */
  const chunks = {};
  for (const file of readdirSync(join(dist, "assets")).sort()) {
    if (!/\.(js|css)$/.test(file)) continue;
    const bytes = brotliCompressSync(
      readFileSync(join(dist, "assets", file)),
    ).length;
    // 同じ名前のチャンクが複数あるときは足す。
    const name = chunkName(file);
    const prev = chunks[name];
    chunks[name] = {
      bytes: (prev?.bytes ?? 0) + bytes,
      initial: (prev?.initial ?? false) || initial.has(file),
    };
  }
  return { chunks };
};

const total = (chunks, onlyInitial) =>
  Object.values(chunks)
    .filter((chunk) => !onlyInitial || chunk.initial)
    .reduce((sum, chunk) => sum + chunk.bytes, 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const signedKb = (bytes) => {
  if (bytes === 0) return "±0";
  return `${bytes > 0 ? "+" : "−"}${kb(Math.abs(bytes))}`;
};

const percent = (base, head) => {
  if (base === 0) return "";
  const ratio = ((head - base) / base) * 100;
  return ` (${ratio >= 0 ? "+" : "−"}${Math.abs(ratio).toFixed(1)}%)`;
};

/** これより小さい差のチャンクは表に出さない。ビルドのたびに数バイトは揺れる。 */
const NOISE_BYTES = 100;

/** 比べた結果の Markdown。`marker` は PR のコメントを探して上書きするための目印。 */
export const compare = (base, head, marker = "") => {
  const rows = [
    ["起動時に読むもの", total(base.chunks, true), total(head.chunks, true)],
    ["すべて", total(base.chunks, false), total(head.chunks, false)],
  ];
  const names = new Set([
    ...Object.keys(base.chunks),
    ...Object.keys(head.chunks),
  ]);
  const changed = [...names]
    .map((name) => {
      const before = base.chunks[name];
      const after = head.chunks[name];
      return {
        name,
        before: before?.bytes ?? 0,
        after: after?.bytes ?? 0,
        initial: (after ?? before).initial,
        state: !before ? "追加" : !after ? "削除" : "",
      };
    })
    .filter((row) => Math.abs(row.after - row.before) >= NOISE_BYTES)
    .sort(
      (a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before),
    );

  const lines = [
    marker,
    "### JS・CSS の大きさ（brotli）",
    "",
    "| | main | この PR | 差 |",
    "|---|---:|---:|---:|",
    ...rows.map(
      ([label, before, after]) =>
        `| ${label} | ${kb(before)} | ${kb(after)} | ${signedKb(after - before)}${percent(before, after)} |`,
    ),
    "",
    "起動時に読むもの = index.html が読むもの。起動した後に `import()` で読むもの（Sentry の SDK など）は「すべて」にだけ入る。",
    "",
  ];
  if (changed.length === 0) {
    lines.push(`${NOISE_BYTES} バイト以上変わったチャンクはありません。`);
  } else {
    lines.push(
      "<details><summary>変わったチャンク</summary>",
      "",
      "| チャンク | main | この PR | 差 |",
      "|---|---:|---:|---:|",
      ...changed.map(
        (row) =>
          `| \`${row.name}\`${row.initial ? " 🚀" : ""}${row.state ? `（${row.state}）` : ""} | ${kb(row.before)} | ${kb(row.after)} | ${signedKb(row.after - row.before)} |`,
      ),
      "",
      "🚀 は起動時に読むチャンク。チャンクはファイル名のハッシュを除いた名前で突き合わせている。",
      "",
      "</details>",
    );
  }
  return `${lines.join("\n").trim()}\n`;
};

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  if (command === "measure") {
    process.stdout.write(`${JSON.stringify(measure(args[0]), null, 2)}\n`);
  } else if (command === "compare") {
    process.stdout.write(compare(read(args[0]), read(args[1]), args[2]));
  } else {
    console.error(
      "使い方: bundle-size.mjs measure <dist> | compare <base.json> <head.json> [marker]",
    );
    process.exit(1);
  }
}
