#!/usr/bin/env node
/**
 * セクションの保持コストを、旧実装 (1 件ごとに全ソート + スライス) と
 * 新実装 (全順序つき二分探索挿入) で比較する。
 *
 * **これは回帰を防がない。** 決定的に主張できるのは通知回数と順序までで、
 * それは vitest 側 (sorted-events.test.ts / section-reader.test.ts) が
 * 担っている。ここでやるのは数字を記録として残し、いつでも測り直せる状態に
 * することだけである。本番コードに比較カウンタを埋めるのは筋が悪く、
 * 壁時計の比は CI で揺れる。
 *
 * 配列操作だけを取り出したものであり、`setItems` のコピーと `<For>` の
 * 突き合わせ (実アプリの支配項) は含まない。
 */

const MAX = 500;

/** 同値を意図的に混ぜる。created_at が全てユニークだと最良ケースになる。 */
const makeEvents = (n, seed = 1) => {
  let x = seed;
  return Array.from({ length: n }, (_, i) => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return {
      id: `e-${String(i).padStart(5, "0")}`,
      created_at: 1_700_000_000 + (x % 1_000),
    };
  });
};

const compareEvents = (a, b) =>
  b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 旧実装。1 件ごとに 2 回ソート + 3 回コピー。 */
const legacy = (incoming) => {
  let items = [];
  const ids = new Set();
  let comparisons = 0;
  const cmp = (a, b) => {
    comparisons++;
    return compareEvents(a, b);
  };

  for (const stored of incoming) {
    if (ids.has(stored.id)) continue;
    ids.add(stored.id);
    const mostRecent = [...items, stored].sort(cmp).slice(0, MAX);
    items = [...mostRecent].sort(cmp);
    if (ids.size > items.length) {
      const kept = new Set(items.map((e) => e.id));
      for (const kid of ids) if (!kept.has(kid)) ids.delete(kid);
    }
  }
  return { items, comparisons };
};

/** 新実装。src/core/read/sorted-events.ts と同じアルゴリズム。 */
const ordered = (incoming) => {
  const items = [];
  const ids = new Set();
  let comparisons = 0;
  const cmp = (a, b) => {
    comparisons++;
    return compareEvents(a, b);
  };

  for (const stored of incoming) {
    if (ids.has(stored.id)) continue;
    if (items.length >= MAX && cmp(stored, items[items.length - 1]) >= 0) {
      continue;
    }
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cmp(items[mid], stored) < 0) lo = mid + 1;
      else hi = mid;
    }
    items.splice(lo, 0, stored);
    ids.add(stored.id);
    if (items.length > MAX) ids.delete(items.pop().id);
  }
  return { items, comparisons };
};

const run = (label, fn, incoming) => {
  const t0 = performance.now();
  const r = fn(incoming);
  return { label, ms: performance.now() - t0, ...r };
};

const row = (n, r) =>
  `${String(n).padEnd(7)} | ${r.label.padEnd(9)} | ${String(r.comparisons).padStart(11)} | ${r.ms.toFixed(1).padStart(7)}`;

console.log("空のセクションへ N 件のバーストが届く\n");
console.log("投入    | 実装      | 比較回数    | ms");
console.log("--------|-----------|-------------|--------");
for (const n of [100, 500, 1000, 2000]) {
  const incoming = makeEvents(n);
  console.log(row(n, run("legacy", legacy, incoming)));
  console.log(row(n, run("ordered", ordered, incoming)));
}

console.log("\n上限 500 に達した状態へ、さらに 500 件が届く\n");
console.log("投入    | 実装      | 比較回数    | ms");
console.log("--------|-----------|-------------|--------");
{
  const incoming = [...makeEvents(MAX, 7), ...makeEvents(500, 99)];
  console.log(row("500+500", run("legacy", legacy, incoming)));
  console.log(row("500+500", run("ordered", ordered, incoming)));
}

// 旧実装と新実装で「何が変わるか」を数字で出す。
//
// **集合が一致することを主張してはならない。** 同値が上限の境界をまたぐと、
// どのイベントが残るかまで変わる (仕様 1.1 の訂正)。旧実装は同値のうち先に
// 着いたものを残し、新実装は id の小さいものを残す。分布によっては偶然
// 一致するので、一致を主張すると「たまたま通るテスト」になる。
{
  const incoming = makeEvents(3000, 42);
  const a = legacy(incoming).items;
  const b = ordered(incoming).items;
  const setA = new Set(a.map((e) => e.id));
  const setB = new Set(b.map((e) => e.id));
  const onlyLegacy = [...setA].filter((id) => !setB.has(id));
  let positionDiff = 0;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) positionDiff++;

  console.log(`\n件数: legacy ${a.length} / ordered ${b.length}`);
  console.log(`  位置がずれた件数     : ${positionDiff} / ${a.length}`);
  console.log(`  旧実装にしか無い件数 : ${onlyLegacy.length}`);
  console.log(
    "  (どちらも 0 とは限らない。同値が上限の境界をまたぐと保持内容が変わる)",
  );
}
