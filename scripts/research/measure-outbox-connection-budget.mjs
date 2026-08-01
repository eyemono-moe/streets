// Outbox が要求する接続先リレー数と、予算内での被覆率を測る。
//
// ADR-0011 の 30 接続上限が「例外時の処理」なのか「常時の運用状態」なのかを
// 決める材料。数字は腐るので、判断を見直すときはこれを再実行すること。
//
//   node scripts/research/measure-outbox-connection-budget.mjs
//
// 結果は docs/research/2026-08-01-outbox-connection-budget.md にある。

const SAMPLER = "wss://yabu.me";
const INDEXER = "wss://directory.yabu.me";
const SUBJECT_COUNT = 4;
const BUDGETS = [10, 20, 30, 40];
const REDUNDANCIES = [1, 2];

/** REQ を投げて EOSE / CLOSED / タイムアウトまで集める */
const query = (url, filters, { timeoutMs = 12000 } = {}) =>
  new Promise((resolve) => {
    const events = [];
    let socket;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        socket?.close();
      } catch {}
      resolve(events);
    };
    const timer = setTimeout(finish, timeoutMs);
    const settle = () => {
      clearTimeout(timer);
      finish();
    };
    try {
      socket = new WebSocket(url);
    } catch {
      return settle();
    }
    socket.onopen = () => socket.send(JSON.stringify(["REQ", "m", ...filters]));
    socket.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      if (msg[0] === "EVENT") events.push(msg[2]);
      if (msg[0] === "EOSE" || msg[0] === "CLOSED") settle();
    };
    socket.onerror = settle;
    socket.onclose = settle;
  });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** 著者ごとに created_at 最大の版を採る (置換可能イベント, NIP-01) */
const newestPerAuthor = (events) => {
  const latest = new Map();
  for (const e of events) {
    const prev = latest.get(e.pubkey);
    if (!prev || e.created_at > prev.created_at) latest.set(e.pubkey, e);
  }
  return latest;
};

const tagValues = (event, name) =>
  (event.tags ?? []).filter(
    (t) => Array.isArray(t) && t[0] === name && typeof t[1] === "string",
  );

/** NIP-65: marker 省略は read+write 両方。read のみを除外する */
const writeRelaysOf = (event) => {
  const urls = [];
  for (const tag of tagValues(event, "r")) {
    if (tag[2] === "read") continue;
    try {
      const u = new URL(tag[1]);
      if (u.protocol !== "wss:" && u.protocol !== "ws:") continue;
      u.search = "";
      u.hash = "";
      if (!urls.includes(u.toString())) urls.push(u.toString());
    } catch {}
  }
  return urls;
};

/**
 * 冗長度つき貪欲集合被覆。実装する RelaySelector と同じアルゴリズム。
 * 各著者の必要本数は min(redundancy, 宣言本数) — 1 本しか宣言していない
 * 著者は原理的に 2 本に到達できないので、redundancy で初期化すると
 * 永久に未充足のまま貪欲の判断を歪める。
 */
const greedyCover = (demand, budget, redundancy) => {
  const need = new Map(
    [...demand].map(([p, urls]) => [p, Math.min(redundancy, urls.length)]),
  );
  const relayToAuthors = new Map();
  for (const [pubkey, urls] of demand)
    for (const url of urls) {
      if (!relayToAuthors.has(url)) relayToAuthors.set(url, new Set());
      relayToAuthors.get(url).add(pubkey);
    }

  const picks = [];
  const pool = new Map(relayToAuthors);
  while (picks.length < budget) {
    let best = null;
    let bestGain = 0;
    for (const [url, authors] of pool) {
      let gain = 0;
      for (const p of authors) if ((need.get(p) ?? 0) > 0) gain++;
      // タイブレークは URL の辞書順 — 同じ入力が常に同じ出力になるように
      if (gain > bestGain || (gain === bestGain && gain > 0 && url < best)) {
        bestGain = gain;
        best = url;
      }
    }
    if (!best || bestGain === 0) break;
    picks.push(best);
    for (const p of pool.get(best)) need.set(p, (need.get(p) ?? 0) - 1);
    pool.delete(best);
  }

  const satisfied = [...need.values()].filter((v) => v <= 0).length;
  const picked = new Set(picks);
  const covered = [...demand].filter(([, urls]) =>
    urls.some((u) => picked.has(u)),
  ).length;
  return { picks, satisfied, covered, relayCount: relayToAuthors.size };
};

// --- 1. 実際に書き込んでいる著者から、フォロー数の多い人を選ぶ ---------------

const notes = await query(SAMPLER, [{ kinds: [1], limit: 300 }]);
const sampled = [...new Set(notes.map((e) => e.pubkey))];
console.log(`sampled authors from ${SAMPLER}: ${sampled.length}`);

const contacts = [];
for (const part of chunk(sampled, 50))
  contacts.push(...(await query(INDEXER, [{ kinds: [3], authors: part }])));

const subjects = [...newestPerAuthor(contacts).values()]
  .map((e) => ({
    pubkey: e.pubkey,
    follows: [...new Set(tagValues(e, "p").map((t) => t[1]))],
  }))
  .sort((a, b) => b.follows.length - a.follows.length)
  .slice(0, SUBJECT_COUNT);

// --- 2. 各人のフォロー先の kind:10002 を引き、被覆率を測る -------------------

for (const subject of subjects) {
  const lists = [];
  for (const part of chunk(subject.follows, 100))
    lists.push(...(await query(INDEXER, [{ kinds: [10002], authors: part }])));

  const demand = new Map();
  for (const [pubkey, event] of newestPerAuthor(lists)) {
    const urls = writeRelaysOf(event);
    if (urls.length > 0) demand.set(pubkey, urls);
  }

  const routable = demand.size;
  const soleRelay = [...demand.values()].filter((u) => u.length === 1).length;
  const pct = (n) => (routable > 0 ? `${Math.round((n / routable) * 100)}%` : "-");

  console.log(`
--- ${subject.pubkey.slice(0, 8)} ---
  フォロー数                     ${subject.follows.length}
  kind:10002 を引けた            ${routable} (ルーティング不能 ${subject.follows.length - routable})
  異なる write リレー数          ${greedyCover(demand, 0, 1).relayCount}
  write を 1 本しか宣言しない人  ${soleRelay} (${pct(soleRelay)})`);

  for (const k of REDUNDANCIES) {
    const row = BUDGETS.map((b) => {
      const r = greedyCover(demand, b, k);
      return `${b}本 ${pct(r.satisfied)}`;
    }).join(" / ");
    console.log(`  冗長度 ${k}: ${row}`);
  }
}
