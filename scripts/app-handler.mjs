#!/usr/bin/env node
/**
 * Streets を説明する kind:31990（NIP-89）の中身を JSON で出す。署名はしない ——
 * リリースのワークフローが、お知らせと同じ鍵で署名して配る。
 *
 *   node scripts/app-handler.mjs   # {"kind":31990,"content":"…","tags":[…]}
 *
 * 投稿の `client` タグはこのイベントを指す（packages/core/src/nostr/build/client-tag.ts）。
 * 表示できる kind は kind-support.json の「表示対応」から作り、増えたらリリースで出し直す。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readKindInventory } from "./nip-support.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export const readHandler = async () =>
  JSON.parse(
    await readFile(
      path.join(root, "packages/core/src/nostr/streets-handler.json"),
      "utf8",
    ),
  );

export const buildAppHandler = (handler, kinds) => ({
  kind: 31990,
  content: JSON.stringify(handler.metadata),
  tags: [
    ["d", handler.identifier],
    ...kinds
      .filter((entry) => entry.status === "表示対応")
      .map((entry) => ["k", String(entry.kind)]),
    ...handler.entities.map((entity) => [
      "web",
      `${handler.origin}/<bech32>`,
      entity,
    ]),
  ],
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = buildAppHandler(await readHandler(), await readKindInventory());
  process.stdout.write(`${JSON.stringify(event)}\n`);
}
