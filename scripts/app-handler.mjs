#!/usr/bin/env node
/**
 * Streets を説明する kind:31990（NIP-89）の中身を JSON で出す。署名はしない ——
 * リリースのワークフローが、お知らせ（個人のアカウント）とは別の、Streets の
 * アカウントの鍵で署名して配る。
 *
 *   node scripts/app-handler.mjs   # {"kind":31990,"content":"…","tags":[…]}
 *
 * 環境変数 STREETS_APP_PRIVATE_KEY があれば、その鍵が `streets-handler.json` の
 * pubkey と合うかを先に確かめ、合わなければ何も出さずに落ちる。別の鍵で出すと、
 * 投稿の `client` タグが指す先に説明が無いままになる。
 *
 * 投稿の `client` タグはこのイベントを指す（packages/core/src/nostr/build/client-tag.ts）。
 * 表示できる kind は kind-support.json の「表示対応」から作り、増えたらリリースで出し直す。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicKey, nip19 } from "nostr-tools";
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

/** 秘密鍵（hex か nsec）が説明の pubkey のものか。 */
export const signsFor = (handler, secret) => {
  const trimmed = secret.trim();
  const key = trimmed.startsWith("nsec1")
    ? nip19.decode(trimmed).data
    : Uint8Array.from(Buffer.from(trimmed, "hex"));
  return getPublicKey(key) === handler.pubkey;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const handler = await readHandler();
  const secret = process.env.STREETS_APP_PRIVATE_KEY;
  if (secret && !signsFor(handler, secret)) {
    process.stderr.write(
      "STREETS_APP_PRIVATE_KEY が streets-handler.json の pubkey と合いません\n",
    );
    process.exit(1);
  }
  const event = buildAppHandler(handler, await readKindInventory());
  process.stdout.write(`${JSON.stringify(event)}\n`);
}
