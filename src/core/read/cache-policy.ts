export type Retention =
  | { type: "latest-per-author" }
  | { type: "capped"; max: number }
  | { type: "none" };

/**
 * このイベントを**誰が見てよいか**。`Retention`（どれだけ持つか）とは
 * 独立した軸であり、混ぜて 1 つのフラグにすると「共有してよいが保持は
 * したくない」（`kind:3` がそれ）を表現できなくなる。
 *
 * - `public` —— 誰が見ても同じ署名済みイベント。共有 DB へ書いてよい
 * - `account` —— その閲覧者にしか意味がない。専用の置き場が要る
 * - `session` —— ディスクへ書かない（NIP-44 の復号結果など）
 */
export type CacheScope = "public" | "account" | "session";

export type CachePolicy = {
  /** 不変な kind では意味を持たない（`Number.POSITIVE_INFINITY` を置く）。 */
  staleMs: number;
  serveWhileRevalidating: boolean;
  retention: Retention;
  scope: CacheScope;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 不変な kind（`kind:1`/`6`/`7` および未知の kind）に当てる既定値。
 *
 * **`scope` は `"session"`。** 分類を名乗らない kind は共有もされず永続化も
 * されない。永続化したい人は「これは誰が見ても同じイベントだ」と
 * `"public"` を明示的に名乗ることになり、名乗り忘れは「書かれない」に
 * 倒れる。逆にしてはいけない —— 共有 DB へ一度書かれたものを後から
 * アカウント別に引き剥がすことはできない。
 */
const DEFAULT_POLICY: CachePolicy = {
  staleMs: Number.POSITIVE_INFINITY,
  serveWhileRevalidating: true,
  retention: { type: "none" },
  scope: "session",
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
      // イベント自体は公開なので scope は "public"。永続化しないのは
      // retention という別軸の判断であって、アカウント境界の問題ではない。
      scope: "public",
    },
  ],
  [
    // リレーリスト。7 日は変更頻度を測っていない暫定値で、まず長めに置く。
    10002,
    {
      staleMs: 7 * DAY_MS,
      serveWhileRevalidating: true,
      retention: { type: "latest-per-author" },
      scope: "public",
    },
  ],
  [
    0,
    {
      staleMs: DAY_MS,
      serveWhileRevalidating: true,
      retention: { type: "latest-per-author" },
      scope: "public",
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

/** 方針そのものから永続化可否を決める。kind を経由しない形も要る
 *  ——「この scope なら書かない」を kind 表に登録せずに確かめられる。 */
export const persistableScope = (policy: CachePolicy): boolean =>
  policy.scope === "public" && policy.retention.type !== "none";

/** 方針表に載っている kind。網羅を確かめるテストのために公開する。 */
export const registeredKinds = (): number[] => [...POLICIES.keys()];

/**
 * この kind を永続層へ書いてよいか。**2 つの軸をどちらも満たすときだけ真。**
 * `retention: none` は「保持しない」ではなく「そもそも書かない」を意味し、
 * `scope` が `public` でないものは置き場がそもそも違う。
 */
export const shouldPersist = (kind: number): boolean =>
  persistableScope(policyFor(kind));
