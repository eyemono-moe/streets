#!/usr/bin/env node
/**
 * ローカルリレーが**クエリに答えられる**ようになるまで待つ。
 *
 * HTTP (NIP-11) の 200 では足りない。nostr-rs-relay は DB を開けなくても
 * listen し、NIP-11 文書だけは返す —— リレー2 が SQLite を開けないまま
 * 起動していたとき、実際に HTTP は生きていた。リレー1 は postgres を使う
 * ので、postgres が ready になる前に HTTP を返す窓もある。その窓で
 * シードを始めると、書いたはずのイベントが後から読めない。
 *
 * だから WebSocket を張って REQ を送り、EOSE が返ることまで確かめる ——
 * これは e2e の globalSetup が最初にやることと同じ経路であり、
 * 「使える」の定義をシードの必要条件に揃えている。
 *
 *   node scripts/wait-for-relays.mjs [ws://... ...]
 *
 * グローバル `WebSocket` を使うので Node 22 以降が要る。
 */

const DEFAULT_RELAYS = ["ws://127.0.0.1:8080", "ws://127.0.0.1:8081"];
const ATTEMPT_TIMEOUT_MS = 5_000;
const DEADLINE_MS = 120_000;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 1 回の試行。REQ を送って EOSE が返れば true。 */
const probe = (url) =>
  new Promise((resolve) => {
    let socket;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // 閉じられない状態でも、判定は既に済んでいる。
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ATTEMPT_TIMEOUT_MS);

    try {
      socket = new WebSocket(url);
    } catch {
      finish(false);
      return;
    }

    socket.onopen = () => {
      socket.send(JSON.stringify(["REQ", "wait-for-relays", { limit: 1 }]));
    };
    socket.onmessage = (event) => {
      // EVENT が先に来ることもある。EOSE まで待って初めて「DB を引き切った」
      // と言える。
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (Array.isArray(message) && message[0] === "EOSE") finish(true);
      // CLOSED は「この REQ は処理できない」という明示の拒否なので、
      // タイムアウトを待たずに失敗として扱う。
      if (Array.isArray(message) && message[0] === "CLOSED") finish(false);
    };
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });

const waitFor = async (url) => {
  const deadline = Date.now() + DEADLINE_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    if (await probe(url)) {
      console.log(`${url} ready (${attempts} 回目)`);
      return true;
    }
    await sleep(RETRY_DELAY_MS);
  }
  console.error(
    `${url} が ${DEADLINE_MS / 1000} 秒以内に REQ へ応答しなかった (${attempts} 回試行)`,
  );
  return false;
};

const relays = process.argv.slice(2);
const targets = relays.length > 0 ? relays : DEFAULT_RELAYS;

// 直列に待つ。並列にすると、どのリレーが遅いのかが出力から読み取れない。
for (const url of targets) {
  if (!(await waitFor(url))) process.exit(1);
}
