import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readInventory, readKindInventory } from "./nip-support.mjs";

const NIP_FILE = /^([0-9A-F]{2})\.md$/;
const MAX_PATCH_BYTES = 300_000;

export const nipIdFromPath = (file) => NIP_FILE.exec(file)?.[1];

export const impactedNips = (files, inventory, kinds) => {
  const byNip = new Map(inventory.map((item) => [item.nip, item]));
  const byKind = new Map(kinds.map((item) => [item.kind, item]));
  return [...new Set(files.map(nipIdFromPath).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((nip) => {
      const entry = byNip.get(nip);
      return {
        nip,
        status: entry?.status ?? "未記載",
        summary: entry?.summary ?? "対応表にない NIP",
        kinds: (entry?.kinds ?? []).map((kind) => ({
          kind,
          status: byKind.get(kind)?.status ?? "未記載",
        })),
        tags: entry?.tags ?? [],
        paths: entry?.paths ?? [],
        gap: entry?.gap ?? "",
      };
    });
};

const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });

/** 差分の実体と、#448 の対応表で絞った候補を保存する。 */
export const scanNips = async ({ repo, base, head, output }) => {
  if (!/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) {
    throw Error("NIPs のコミット ID が不正です");
  }
  git(repo, "merge-base", "--is-ancestor", base, head);
  const changed = git(repo, "diff", "--name-only", base, head, "--")
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((file) => nipIdFromPath(file) !== undefined);
  const semantic = changed.filter((file) => {
    try {
      git(
        repo,
        "diff",
        "--ignore-all-space",
        "--quiet",
        base,
        head,
        "--",
        file,
      );
      return false;
    } catch (error) {
      if (error.status === 1) return true;
      throw error;
    }
  });
  const inventory = await readInventory();
  const kinds = await readKindInventory();
  const items = impactedNips(semantic, inventory, kinds);
  const patches = items.map((item) => ({
    ...item,
    patch: git(repo, "diff", "--unified=8", base, head, "--", `${item.nip}.md`),
  }));
  if (
    Buffer.byteLength(patches.map((item) => item.patch).join("")) >
    MAX_PATCH_BYTES
  ) {
    throw Error(
      "NIPs の差分が 300 KB を超えています。手作業で分割してください",
    );
  }
  await mkdir(output, { recursive: true });
  await mkdir(path.join(output, "patches"), { recursive: true });
  await mkdir(path.join(output, "nips"), { recursive: true });
  for (const item of patches) {
    await writeFile(
      path.join(output, "patches", `${item.nip}.patch`),
      item.patch,
    );
    try {
      await writeFile(
        path.join(output, "nips", `${item.nip}.md`),
        git(repo, "show", `${head}:${item.nip}.md`),
      );
    } catch (error) {
      if (error.status !== 128) throw error;
    }
  }
  const report = {
    base,
    head,
    changed: items,
    ignoredWhitespace: changed.filter((file) => !semantic.includes(file)),
  };
  await writeFile(
    path.join(output, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(path.join(output, "report.md"), renderImpactReport(report));
  return report;
};

export const renderImpactReport = (report) =>
  [
    `NIPs の更新: https://github.com/nostr-protocol/nips/compare/${report.base}...${report.head}`,
    "",
    ...report.changed.flatMap((item) => [
      `## NIP-${item.nip}（${item.status}）`,
      `- Streets の機能: ${item.summary}`,
      `- kind: ${item.kinds.map(({ kind, status }) => `${kind}（${status}）`).join(", ") || "該当なし"}`,
      `- タグ: ${item.tags.join(", ") || "該当なし"}`,
      `- 実装候補: ${item.paths.join(", ") || "対応表に記載なし"}`,
      `- 既知の差: ${item.gap || "なし"}`,
      `- 差分: .nip-tracking/patches/${item.nip}.patch`,
      `- 更新後の本文: .nip-tracking/nips/${item.nip}.md（削除された NIP では存在しない）`,
      "",
    ]),
  ].join("\n");
