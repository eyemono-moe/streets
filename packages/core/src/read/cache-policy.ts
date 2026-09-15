export type Retention =
  | { type: "latest-per-author" }
  | { type: "capped"; max: number }
  | { type: "none" };

/**
 * このイベントを**誰が見てよいか**。`Retention` (どれだけ持つか) とは別軸。
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
 * 不変な kind の既定値。`scope` は `"session"` —— 共有 DB へ一度書いたものは
 * 後から引き剥がせないため、名乗り忘れは「書かれない」側に安全に倒す。
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
    // フォローリスト。SortedEvents は追記専用で取り除く経路が無いため、古い
    // メンバーシップを使うと外した著者を画面から消せない。staleMs: 0 だけでは
    // 取り直す間の古い値を止められないので serveWhileRevalidating も false。
    3,
    {
      staleMs: 0,
      serveWhileRevalidating: false,
      retention: { type: "none" },
      // イベント自体は公開なので "public"。永続化しないのは retention の判断で、アカウント境界とは別問題。
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
 * `staleMs: 0`/`Infinity` は意味の両端なので個別判定する。`fetchedAt: 0`
 * (invalidate が置く値) は誤判定を避けるため無条件に stale とする。
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

/** 方針そのものから永続化可否を決める —— kind を経由せず「この scope なら書かない」を確かめられる。 */
export const persistableScope = (policy: CachePolicy): boolean =>
  policy.scope === "public" && policy.retention.type !== "none";

/** 方針表に載っている kind。網羅を確かめるテストのために公開する。 */
export const registeredKinds = (): number[] => [...POLICIES.keys()];

/**
 * `persistableScope(policyFor(kind))` の薄いラッパ。2 つの永続化実装の
 * 共通入口 —— 今日は判定が効かないが、将来 `"account"` 等が方針表に載ると効く。
 */
export const shouldPersist = (kind: number): boolean =>
  persistableScope(policyFor(kind));
