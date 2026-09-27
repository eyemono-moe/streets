import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const inventoryPath = path.join(
  root,
  "packages/core/src/nostr/nip-support.json",
);
export const docsPath = path.join(root, "docs/nips.md");

export const readInventory = async () =>
  JSON.parse(await readFile(inventoryPath, "utf8"));

const nipLink = (nip) =>
  `[NIP-${nip}](https://github.com/nostr-protocol/nips/blob/master/${nip}.md)`;

export const renderNipSupport = (inventory) =>
  [
    "# Streets の NIP 対応",
    "",
    "この表は `packages/core/src/nostr/nip-support.json` から生成する。画面の「Streets について」も同じデータを使う。`対応` は記載した機能の範囲で扱えること、`一部` は仕様の一部を扱うことを表す。NIP の全文への準拠を保証する表ではない。",
    "",
    "NIP の仕様変更時は、対応の程度、実装箇所、kind・タグ、残る差を更新する。生成は `vp run nips:generate`。",
    "",
    "| NIP | 対応 | Streets でできること | kind | タグ | 主な実装 | まだ扱わないこと |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.map(
      ({ nip, status, summary, kinds, tags, paths, gap }) =>
        `| ${nipLink(nip)} | ${status} | ${summary} | ${kinds.join(", ") || "—"} | ${tags.map((tag) => `\`${tag}\``).join(", ") || "—"} | ${paths.map((file) => `[\`${path.basename(file)}\`](../${file})`).join("<br>") || "—"} | ${gap || "—"} |`,
    ),
    "",
  ].join("\n");

export const validateInventory = async (inventory) => {
  const seen = new Set();
  for (const entry of inventory) {
    if (!/^[0-9A-F]{2}$/.test(entry.nip))
      throw Error(`NIP 番号が不正: ${entry.nip}`);
    if (seen.has(entry.nip)) throw Error(`NIP が重複: ${entry.nip}`);
    seen.add(entry.nip);
    if (!["対応", "一部", "未対応"].includes(entry.status))
      throw Error(`対応状態が不正: ${entry.nip}`);
    if (
      !entry.summary ||
      !Array.isArray(entry.kinds) ||
      !Array.isArray(entry.tags) ||
      !Array.isArray(entry.paths)
    )
      throw Error(`項目が不足: ${entry.nip}`);
    if (entry.status === "未対応" && entry.paths.length > 0)
      throw Error(`未対応 NIP に実装がある: ${entry.nip}`);
    for (const file of entry.paths) await access(path.join(root, file));
  }
};
