#!/usr/bin/env node
/**
 * ローカルリレーに署名済みの kind:1 を 1 件 publish する。
 *
 * /debug/v1-section を開いたまま実行すると、リロードせずに items が +1 され
 * リストの先頭に現れる。購読が張りっぱなしで新着が Solid のシグナルまで
 * 届いていることの確認に使う。
 *
 *   pnpm dev:relay:publish
 *   pnpm dev:relay:publish "好きな本文"
 *
 * 鍵は実行のたびに使い捨てで生成する。署名は本物なのでリレーに受理される。
 * 手順の全体は docs/design/verifying-v1-section.md を参照。
 */

import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const RELAY_URL = process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
const content = process.argv[2] ?? `test note ${new Date().toISOString()}`;

const secretKey = schnorr.utils.randomSecretKey();
const unsigned = {
  pubkey: bytesToHex(schnorr.getPublicKey(secretKey)),
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content,
};

// NIP-01 の正規化シリアライズ。src/core/nostr/event.ts の computeEventId と同じ。
const id = bytesToHex(
  sha256(
    utf8ToBytes(
      JSON.stringify([
        0,
        unsigned.pubkey,
        unsigned.created_at,
        unsigned.kind,
        unsigned.tags,
        unsigned.content,
      ]),
    ),
  ),
);
const event = {
  ...unsigned,
  id,
  sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
};

const socket = new WebSocket(RELAY_URL);

const timeout = setTimeout(() => {
  console.error(`no response from ${RELAY_URL} within 5s`);
  process.exit(1);
}, 5000);

socket.onerror = () => {
  clearTimeout(timeout);
  console.error(`could not connect to ${RELAY_URL}`);
  console.error("ローカルリレーは起動していますか: docker compose up -d");
  process.exit(1);
};

socket.onopen = () => socket.send(JSON.stringify(["EVENT", event]));

socket.onmessage = (message) => {
  clearTimeout(timeout);
  const [type, , accepted, reason] = JSON.parse(message.data);
  socket.close();
  if (type !== "OK") return;
  if (accepted) {
    console.log(`published to ${RELAY_URL}`);
    console.log(`  id      ${id}`);
    console.log(`  content ${content}`);
    console.log("\n/debug/v1-section の items が +1 されていれば成功です。");
    process.exit(0);
  }
  console.error(`relay rejected the event: ${reason}`);
  process.exit(1);
};
