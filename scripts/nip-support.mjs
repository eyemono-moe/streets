import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const inventoryPath = path.join(
  root,
  "packages/core/src/nostr/nip-support.json",
);
export const docsPath = path.join(root, "docs/nips.md");
export const kindInventoryPath = path.join(
  root,
  "packages/core/src/nostr/kind-support.json",
);

export const readInventory = async () =>
  JSON.parse(await readFile(inventoryPath, "utf8"));
export const readKindInventory = async () =>
  JSON.parse(await readFile(kindInventoryPath, "utf8"));

const nipLink = (nip) =>
  `[NIP-${nip}](https://github.com/nostr-protocol/nips/blob/master/${nip}.md)`;

export const renderNipSupport = (inventory, kindInventory) =>
  [
    "# Streets の NIP 対応",
    "",
    "この表は `packages/core/src/nostr/nip-support.json` と `kind-support.json` から生成する。画面の「Streets について」も同じデータを使う。NIP の `対応` は記載した機能の範囲で扱えること、`一部` は仕様の一部を扱うことを表す。NIP の全文への準拠を保証する表ではない。",
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
    "## kind ごとの対応",
    "",
    "`表示対応` は `Event` に渡したとき専用の表示がある。`内部利用` は読み書きなどに使うが、`Event` に渡すと未対応表示になる。`未対応` は現在扱わない。NIP の対応状態と kind の表示対応は別の意味を持つ。",
    "",
    "| kind | 対応 | 内容 | 関連する NIP |",
    "| --- | --- | --- | --- |",
    ...kindInventory.map(
      ({ kind, status, summary }) =>
        `| ${kind} | ${status} | ${summary} | ${
          inventory
            .filter((entry) => entry.kinds.includes(kind))
            .map((entry) => nipLink(entry.nip))
            .join(", ") || "—"
        } |`,
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

export const validateKindInventory = (inventory, kinds) => {
  const seen = new Set();
  for (const entry of kinds) {
    if (!Number.isSafeInteger(entry.kind) || entry.kind < 0)
      throw Error(`kind が不正: ${entry.kind}`);
    if (seen.has(entry.kind)) throw Error(`kind が重複: ${entry.kind}`);
    seen.add(entry.kind);
    if (!["表示対応", "内部利用", "未対応"].includes(entry.status))
      throw Error(`対応状態が不正: kind:${entry.kind}`);
    if (!entry.summary) throw Error(`内容がない: kind:${entry.kind}`);
  }
  for (const entry of inventory) {
    for (const kind of entry.kinds) {
      if (!seen.has(kind))
        throw Error(`NIP-${entry.nip} の kind:${kind} が一覧にない`);
    }
  }
};
