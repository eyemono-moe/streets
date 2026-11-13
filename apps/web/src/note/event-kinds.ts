/**
 * 専用の描き方を持つ kind。描き方は `Event.tsx` の `EVENT_VIEWS` に、この並びと
 * 同じ kind をキーにして書く（足りなければ型検査が落ちる）。
 * `.tsx` に置かないのは、`kind-support.json` との照合（`scripts/nip-support.test.mjs`）が
 * Node からそのまま import できるようにするため。
 */
export const RENDERED_KINDS = [
  0, 1, 6, 7, 16, 20, 21, 22, 40, 41, 42, 1068, 1111, 30000, 30002, 30003,
  30004, 30005, 30006, 30015, 30023, 30030, 39089, 39092,
] as const;

export type RenderedKind = (typeof RENDERED_KINDS)[number];

export const isRenderedKind = (kind: number): kind is RenderedKind =>
  (RENDERED_KINDS as readonly number[]).includes(kind);

/**
 * 専用の描き方が無いときに、名前で何かを伝えられる kind。名前は辞書の
 * `note.kindName.<kind>` に置く。NIPs の kind の一覧から、タイムラインや
 * リポストで流れてきうる、人に見せる中身のものだけを選んである。
 * 0・7・42 などの専用の描き方を持つ kind も、リポストの中では枠ごと描けないので名前を持つ。
 */
export const NAMED_KINDS = [
  0, 7, 8, 9, 11, 17, 40, 41, 42, 54, 64, 818, 1018, 1063, 1222, 1244, 1311,
  1337, 1617, 1618, 1621, 1984, 1985, 2003, 9041, 9321, 9734, 9735, 9802, 30009,
  30017, 30018, 30040, 30041, 30063, 30311, 30312, 30315, 30402, 30617, 30818,
  31922, 31923, 31924, 31925, 31989, 31990, 32267, 34235, 34236, 34550, 37516,
  39701,
] as const;

export type NamedKind = (typeof NAMED_KINDS)[number];

export const isNamedKind = (kind: number): kind is NamedKind =>
  (NAMED_KINDS as readonly number[]).includes(kind);

/**
 * 作った人や説明を出さない kind。暗号化したもの・認証や通信のためのものは、
 * 人に読ませるために出されたものではない。
 */
const OPAQUE_KINDS: readonly number[] = [
  4, 13, 14, 15, 443, 444, 445, 1059, 7374, 7375, 7376, 13194, 17375, 21059,
  22242, 23194, 23195, 24133, 24242, 27235,
];

export const isOpaqueKind = (kind: number): boolean =>
  OPAQUE_KINDS.includes(kind);
