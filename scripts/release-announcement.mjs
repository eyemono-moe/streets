#!/usr/bin/env node
/**
 * リリースのお知らせ（kind:1）の本文を出す。リリースのワークフローが、Streets の
 * アカウントの鍵で署名して配る。
 *
 *   node scripts/release-announcement.mjs v1.2.3
 *
 * 本文にはリリースノート（apps/web/src/releases/<タグ>.md）を入れる。Nostr の
 * クライアントの多くは Markdown を描かないので、見出しは【】に、リンクは
 * 「文字 (URL)」にする。人の参照（nostr:…）はそのまま押せるので残す。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const APP_URL = "https://streets.eyemono.moe";
const REPOSITORY_URL = "https://github.com/eyemono-moe/streets";

/** 先頭の日付（--- で囲んだ部分）を外す。 */
const withoutFrontMatter = (markdown) => {
  const lines = markdown.split("\n");
  if (lines[0] !== "---") return lines;
  const end = lines.indexOf("---", 1);
  return end < 0 ? lines : lines.slice(end + 1);
};

/** 見出しを【】に、リンクを「文字 (URL)」にし、空行は 1 つに詰める。 */
const plainNotes = (markdown) => {
  const out = [];
  let blank = false;
  let heading = false;
  for (const raw of withoutFrontMatter(markdown)) {
    if (raw.trim() === "") {
      blank = true;
      continue;
    }
    const line = raw
      .replace(/^#+ +(.*)$/, "【$1】")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");
    // 頭と、見出しの直後の空行は落とす。
    if (out.length > 0 && blank && !heading) out.push("");
    out.push(line);
    blank = false;
    heading = line.startsWith("【");
  }
  return out.join("\n");
};

export const announcementContent = (tag, markdown) =>
  [
    `Streets ${tag} がリリースされました🎉`,
    APP_URL,
    "",
    plainNotes(markdown),
    "",
    `リリースノート: ${REPOSITORY_URL}/releases/tag/${tag}`,
    "#Streets",
  ].join("\n");

const readNotes = (tag) =>
  readFile(path.join(root, "apps/web/src/releases", `${tag}.md`), "utf8");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    process.stderr.write("使い方: release-announcement.mjs <タグ>\n");
    process.exit(1);
  }
  process.stdout.write(`${announcementContent(tag, await readNotes(tag))}\n`);
}
