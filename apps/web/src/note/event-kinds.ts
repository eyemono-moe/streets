/**
 * 専用の描き方を持つ kind。描き方は `Event.tsx` の `EVENT_VIEWS` に、この並びと
 * 同じ kind をキーにして書く（足りなければ型検査が落ちる）。
 * `.tsx` に置かないのは、`kind-support.json` との照合（`scripts/nip-support.test.mjs`）が
 * Node からそのまま import できるようにするため。
 */
export const RENDERED_KINDS = [
  0, 1, 6, 7, 16, 20, 21, 22, 40, 41, 42, 1068, 1111, 30000, 30023, 30030,
] as const;

export type RenderedKind = (typeof RENDERED_KINDS)[number];

export const isRenderedKind = (kind: number): kind is RenderedKind =>
  (RENDERED_KINDS as readonly number[]).includes(kind);
