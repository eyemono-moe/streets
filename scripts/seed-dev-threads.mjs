#!/usr/bin/env node
/**
 * スレッド機能 (`src/core/view/thread-spine.ts`,
 * `docs/superpowers/specs/2026-08-22-thread-design.md`) を手で触って確かめる
 * ためだけの開発用シード。ユニットテストと e2e が主張の正しさは検証済み
 * ——ここでは「変な形のスレッドが画面でどう見えるか」を人間が目視するための
 * 材料を作る。
 *
 * **`e2e/` には置かない。** `e2e/global-setup.ts` が読むフィクスチャに
 * 混ぜると、この大量のノート (深いチェーン・幅 30 件の返信など) が
 * 毎回の CI 実行でも publish されてリレーを汚し、実際の e2e assertion が
 * 見るはずのデータ量を変えてしまう。このファイルはどの e2e からも import
 * されず、`e2e/fixtures/fixture-pubkeys.test.ts` の走査対象にも入らない
 * (下記の鍵がその走査対象と衝突しないことは、別途手計算で確認済み——
 * seed 130_000 は既存のどの `secretKey(...)` 呼び出しとも
 * `% 255` を含め衝突しない)。
 *
 * ## 画面から辿り着く方法
 *
 * 人間は自分の NIP-07 拡張でログインするので、このシードの著者本人には
 * なれない。`/v1?relays=ws://127.0.0.1:8080` を開いて（`?relays=` は
 * `src/routes/v1/parse-relays.ts` が読む e2e 専用の抜け道で、
 * `fallbackRelays`/`indexers` をローカルリレーへ丸ごと差し替える）、
 * 「+ カラムを追加」→「ユーザー」→ 下に印字される npub を貼って追加する
 * だけでよい。`user` 列の `ColumnSource` は明示 `relays` を持たない
 * (`column-presets.ts`) が、`?relays=` は `createReadLayer` の
 * `fallbackRelays` そのものを差し替える (`src/routes/v1.tsx`) ので、
 * 明示リレーの無い列もローカルリレーへ落ちる。スレッドを開いたときの
 * 購読 (`createThreadSource`) も同じ `fallbackRelays` を継承するので、
 * 追加の設定は要らない — 実際にコードを読んで確認した。
 *
 * 列には同じ著者の全ノートが時系列 (新しい順) に並ぶ。どれが何の形かは
 * 本文に書いてあるので、下の出力と見比べながら好きなノートを押せばよい。
 *
 * ## 作らない形 — 循環
 *
 * イベント id は自分自身のタグを含む内容のハッシュである。あるイベントが
 * 自分の祖先を指すには、まずそのイベントの id が確定していなければならず、
 * 2 イベントが互いを親として指す循環を作るには、双方の id が相手の id に
 * 依存する不動点が要る——これは実在のリレー相手には構成できない。
 * `threadSpine` の訪問済み集合ガード (`thread-spine.ts`) はこの形の
 * 「publish され得ないデータ」への防御であり、手で組み立てたオブジェクトを
 * 直接渡せるユニットテストだけがそこへ到達できる。ここでは作らない。
 *
 * ## 実行
 *
 *   pnpm seed:dev
 *
 * 著者鍵は固定 (使い捨てではない) なので、追加したユーザー列は再実行後も
 * 同じ npub のまま使える。ただし `created_at` は実行時刻を使うため、
 * 再実行するたびに内容は同じでも id の異なる新しい一式が積み増される。
 * まっさらな状態から見たいときは先に `pnpm dev:relay:reset` を挟む。
 */

import { Relay, nip19 } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const relayUrl = process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

// e2e フィクスチャ (`e2e/fixtures/*.ts`) と同じ組み立て式。既存の
// どの `secretKey(seed)` 呼び出しとも `% 255` を含めて衝突しない帯
// (130_000) を選んでいる — 手計算で確認済み (このコメント自体は
// ビルドを落とさないので、次に鍵を足す人は必ず自分でも確認すること)。
const secretKey = (seed) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const authorSecretKey = secretKey(130_000);
const authorPubkey = getPublicKey(authorSecretKey);

// 実行時刻を起点にする。過去の固定時刻 (e2e フィクスチャの流儀) にしないのは、
// このシードが「決定的な assertion の材料」ではなく「人間が画面で見つけたい
// 最新のノート」だから — 列の先頭近くに出た方が探しやすい。
const startedAt = Math.floor(Date.now() / 1000);
let tick = 0;
const nextCreatedAt = () => startedAt + tick++;

// 実在のイベントを指さない、意図的に偽の id。すべて "a" にしているのは
// 「これは publish されていない」ことが見た目からも分かるようにするため。
// HEX_64 (`event-refs.ts`) の形さえ満たせば、`replyTarget`/`threadRoot` は
// 実在確認をせずタグをそのまま解釈する。
const FAKE_UNREACHABLE_PARENT_ID = "a".repeat(64);

const publish = async (relay, template, key) => {
  const event = finalizeEvent(template, key);
  await relay.publish(event);
  return event;
};

const note = (content, tags, createdAt = nextCreatedAt()) => ({
  kind: 1,
  created_at: createdAt,
  tags,
  content,
});

const rootTag = (id) => ["e", id, "", "root"];
const replyTag = (id) => ["e", id, "", "reply"];

const seedDeepChain = async (relay) => {
  const DEPTH = 7;
  let parent = await publish(
    relay,
    note("[streets dev seed] 深いチェーン 0/7 (根)", []),
    authorSecretKey,
  );
  const root = parent;
  for (let level = 1; level <= DEPTH; level++) {
    const tags =
      level === 1
        ? [rootTag(root.id)]
        : [rootTag(root.id), replyTag(parent.id)];
    parent = await publish(
      relay,
      note(
        `[streets dev seed] 深いチェーン ${level}/${DEPTH} — 祖先を 1 段ずつ辿れているかはここまで来て初めて分かる`,
        tags,
      ),
      authorSecretKey,
    );
  }
  return { root, deepest: parent, depth: DEPTH };
};

const seedWideThread = async (relay) => {
  const REPLY_COUNT = 30;
  const root = await publish(
    relay,
    note(
      `[streets dev seed] 幅の広いスレッドの根 — 直接の返信が ${REPLY_COUNT} 件ある`,
      [],
    ),
    authorSecretKey,
  );
  for (let i = 1; i <= REPLY_COUNT; i++) {
    await publish(
      relay,
      note(`[streets dev seed] 幅の広いスレッドへの返信 ${i}/${REPLY_COUNT}`, [
        rootTag(root.id),
      ]),
      authorSecretKey,
    );
  }
  return { root, replyCount: REPLY_COUNT };
};

const seedBranching = async (relay) => {
  const root = await publish(
    relay,
    note("[streets dev seed] 分岐スレッドの根 — 直接の返信は A, B の 2 件", []),
    authorSecretKey,
  );
  const a = await publish(
    relay,
    note(
      "[streets dev seed] 分岐 A (根の子) — 直接の返信は A1, A2 の 2 件。兄弟 B は根を開いている間は見えない",
      [rootTag(root.id)],
    ),
    authorSecretKey,
  );
  await publish(
    relay,
    note("[streets dev seed] 分岐 A1 (A の子) — これ以上返信は無い", [
      rootTag(root.id),
      replyTag(a.id),
    ]),
    authorSecretKey,
  );
  await publish(
    relay,
    note("[streets dev seed] 分岐 A2 (A の子) — これ以上返信は無い", [
      rootTag(root.id),
      replyTag(a.id),
    ]),
    authorSecretKey,
  );
  const b = await publish(
    relay,
    note(
      "[streets dev seed] 分岐 B (根の子) — 直接の返信は B1 の 1 件。兄弟 A は根を開いている間は見えない",
      [rootTag(root.id)],
    ),
    authorSecretKey,
  );
  const b1 = await publish(
    relay,
    note(
      "[streets dev seed] 分岐 B1 (B の子) — さらに子 B1a がいる。B を開いている間は見えない",
      [rootTag(root.id), replyTag(b.id)],
    ),
    authorSecretKey,
  );
  await publish(
    relay,
    note("[streets dev seed] 分岐 B1a (B1 の子) — これ以上返信は無い", [
      rootTag(root.id),
      replyTag(b1.id),
    ]),
    authorSecretKey,
  );
  return { root, a, b };
};

const seedMissingAncestor = async (relay) => {
  const event = await publish(
    relay,
    note(
      "[streets dev seed] 祖先が欠けた返信 — root マーカーの参照先は実際には publish されていない。開くと「これより前の返信は取得できていません」が (セクションが落ち着いてから) 出るはず",
      [rootTag(FAKE_UNREACHABLE_PARENT_ID)],
    ),
    authorSecretKey,
  );
  return { event };
};

const seedReplyMarkerOnly = async (relay) => {
  const parent = await publish(
    relay,
    note(
      "[streets dev seed] reply-only の祖先 — これ自体は実際に publish されている",
      [],
    ),
    authorSecretKey,
  );
  const child = await publish(
    relay,
    note(
      "[streets dev seed] root マーカーの無い reply — threadRoot() が undefined を返すので、このノート自身が根として扱われる。親は実在するが辿れない (NIP-10 非準拠のありがちな形)",
      [replyTag(parent.id)],
    ),
    authorSecretKey,
  );
  return { parent, child };
};

const seedUnmarkedPositionalTag = async (relay) => {
  const anchor = await publish(
    relay,
    note(
      "[streets dev seed] 位置ベース e タグの対象 — これも実際に publish されている",
      [],
    ),
    authorSecretKey,
  );
  const event = await publish(
    relay,
    note(
      "[streets dev seed] マーカー無しの位置ベース e タグ (deprecated / 解決不能) — replyTarget() はこれを無視するので、根として表示され祖先は 0 件になる",
      // marker (4 番目の要素) を持たない、旧来の位置ベース形式そのもの。
      [["e", anchor.id]],
    ),
    authorSecretKey,
  );
  return { anchor, event };
};

const noteId = (id) => nip19.noteEncode(id);

const main = async () => {
  const relay = await Relay.connect(relayUrl);
  try {
    const deepChain = await seedDeepChain(relay);
    const wideThread = await seedWideThread(relay);
    const branching = await seedBranching(relay);
    const missingAncestor = await seedMissingAncestor(relay);
    const replyMarkerOnly = await seedReplyMarkerOnly(relay);
    const positional = await seedUnmarkedPositionalTag(relay);

    const npub = nip19.npubEncode(authorPubkey);

    console.log(`[streets seed:dev] relay=${relayUrl}`);
    console.log("");
    console.log("著者 (全ノート共通)");
    console.log(`  npub  ${npub}`);
    console.log("");
    console.log("画面での辿り着き方: /v1?relays=ws://127.0.0.1:8080 を開き、");
    console.log(
      "「+ カラムを追加」→「ユーザー」に上の npub を貼って追加する。",
    );
    console.log("");
    console.log("作った形:");
    console.log(
      `  1. 深いチェーン (祖先 ${deepChain.depth} 段)        最深部 ${noteId(deepChain.deepest.id)}`,
    );
    console.log(
      `  2. 幅の広いスレッド (直接の返信 ${wideThread.replyCount} 件)  根 ${noteId(wideThread.root.id)}`,
    );
    console.log(
      `  3. 分岐 (兄弟・孫まである木)          根 ${noteId(branching.root.id)}`,
    );
    console.log(
      `  4. 祖先が欠けた返信 (reachedRoot: false)  ${noteId(missingAncestor.event.id)}`,
    );
    console.log(
      `  5. root マーカー無しの reply (threadRoot() が undefined)  ${noteId(replyMarkerOnly.child.id)}`,
    );
    console.log(
      `  6. マーカー無しの位置ベース e タグ (無視される)  ${noteId(positional.event.id)}`,
    );
    console.log("");
    console.log(
      "循環は作っていない — スクリプト冒頭のコメント参照 (id は自分自身の",
    );
    console.log("タグを含むハッシュなので、実在のリレー上には構成できない)。");
  } finally {
    relay.close();
  }
};

await main();
