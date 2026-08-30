/**
 * `?budget=<n>` を `ConnectionPool` の `maxConnections` へ渡せる値に変換する
 * (`src/routes/debug/v1-section.tsx`)。
 *
 * `undefined` を返すのは「既定 (`MAX_CONNECTIONS`) に委ねる」の合図であり、
 * 呼び出し側はそのまま `SubscriptionManagerOptions.maxConnections` へ渡す。
 * 不正な入力を黙ってそのまま通すと ADR-0011 の予算が数字の意味を失う
 * (Task 12 fix round 1 で見つかった 2 件):
 *
 * - 空文字 (`?budget=` のように値だけ空) は `Number("")` が `0` になる —
 *   「未指定」のつもりが「予算ゼロ」になってしまう。
 * - 小数 (`?budget=4.5`) は `Number.isFinite` を通ってしまい、
 *   `picks.length < 4.5` のような比較で 5 本目の pick を静かに許してしまう。
 *   `Number.isInteger` でもう一段締める。
 *
 * ついでに 0 以下も弾く — 0 や負の予算は「既定に委ねる」の意図である
 * 可能性のほうが「本気でゼロ本にしたい」より遥かに高く、後者を要求したい
 * 呼び出し元は今のところ存在しない。
 */
export const parseBudget = (param: string | null): number | undefined => {
  if (param === null) return undefined;
  if (param.trim() === "") return undefined;

  const parsed = Number(param);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;

  return parsed;
};
