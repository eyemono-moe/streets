import type { RelayUrl } from "../relay/relay-connection";

/**
 * 著者を指定した読み取りを、どこへ送るか。
 *
 * - `outbox`: 著者ごとに、その人の書き込みリレー（kind:10002）から読む
 * - `direct`: 誰の投稿も `relays` から読む。kind:10002 が引けない環境
 *   （ローカルリレー、閉じたコミュニティ、インデクサの障害）で、繋いだ
 *   リレーにあるイベントが fallback へ回って見えなくなるのを避ける
 *
 * `direct` の `relays: []` は「リレー 0 本」であって fallback ではない。
 * 自分の一覧を取りに行っている間に、fallback へ一瞬購読しないため。
 */
export type ReadRouting =
  | { mode: "outbox" }
  | { mode: "direct"; relays: readonly RelayUrl[] };

export const OUTBOX_ROUTING: ReadRouting = { mode: "outbox" };

export const sameReadRouting = (a: ReadRouting, b: ReadRouting): boolean => {
  if (a.mode === "outbox" || b.mode === "outbox") return a.mode === b.mode;
  return (
    a.relays.length === b.relays.length &&
    a.relays.every((url, index) => url === b.relays[index])
  );
};
