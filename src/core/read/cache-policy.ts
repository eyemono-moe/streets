export type Retention =
  | { type: "latest-per-author" }
  | { type: "capped"; max: number }
  | { type: "none" };

export type CachePolicy = {
  /** 不変な kind では意味を持たない（`Number.POSITIVE_INFINITY` を置く）。 */
  staleMs: number;
  serveWhileRevalidating: boolean;
  retention: Retention;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 不変な kind（`kind:1`/`6`/`7` および未知の kind）に当てる既定値。 */
const DEFAULT_POLICY: CachePolicy = {
  staleMs: Number.POSITIVE_INFINITY,
  serveWhileRevalidating: true,
  retention: { type: "none" },
};

/**
 * kind ごとの初期値。**暫定であり、根拠のある値ではない**
 * （使いながら詰める。実測に基づくものではない）。
 */
const POLICIES: ReadonlyMap<number, CachePolicy> = new Map([
  [
    // フォローリスト。SortedEvents は追記専用でイベントを取り除く経路を持たない
    // ため、古いメンバーシップで購読すると外したはずの著者を画面から消せない。
    // staleMs: 0 だけでは「取り直す間も古い値を使わない」を表現できないので
    // serveWhileRevalidating を別軸として false にする。
    3,
    {
      staleMs: 0,
      serveWhileRevalidating: false,
      retention: { type: "none" },
    },
  ],
  [
    // リレーリスト。7 日は変更頻度を測っていない暫定値で、まず長めに置く。
    10002,
    {
      staleMs: 7 * DAY_MS,
      serveWhileRevalidating: true,
      retention: { type: "latest-per-author" },
    },
  ],
  [
    0,
    {
      staleMs: DAY_MS,
      serveWhileRevalidating: true,
      retention: { type: "latest-per-author" },
    },
  ],
]);

export const policyFor = (kind: number): CachePolicy =>
  POLICIES.get(kind) ?? DEFAULT_POLICY;

/**
 * `staleMs: 0` と `Infinity` は算術境界ではなく意味の両端 —— 常に取り直す /
 * 決して取り直さない —— なので個別に判定する。`fetchedAt: 0` は
 * `EventStore.invalidate` が置く値で、経過時間の計算に乗せると
 * （`now` も 0 に近いテストの偽時計では特に）新鮮と誤判定しうるため、
 * これも finite な `staleMs` の下では無条件に stale として扱う。
 */
export const isStale = (
  policy: CachePolicy,
  fetchedAt: number,
  now: number,
): boolean => {
  if (policy.staleMs === 0) return true;
  if (!Number.isFinite(policy.staleMs)) return false;
  if (fetchedAt === 0) return true;
  return now - fetchedAt > policy.staleMs;
};

/**
 * この kind を永続層へ書いてよいか。`retention: none` は「保持しない」では
 * なく「そもそも書かない」を意味する —— `kind:3` がこれに当たり、古い
 * フォローリストがディスクに残ると、後から読む誰かがそれを使いうる。
 */
export const shouldPersist = (kind: number): boolean =>
  policyFor(kind).retention.type !== "none";
