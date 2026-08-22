import type { NostrEvent } from "../event";

/**
 * ビルダが返すもの。**`pubkey` と `created_at` を持たない。**
 *
 * その 2 つを押すのは `Writer` の責務 (spec 4 節)。ビルダに持たせると
 * 時計の取り方が 9 ファイルに散り、`created_at` を付け忘れたビルダが
 * 1 つ混ざっても型が通る。持てない形にしてあるので押し忘れは型で落ちる。
 */
export type EventDraft = {
  kind: number;
  tags: string[][];
  content: string;
};

/**
 * 置換可能イベントの差分適用。`Writer.replace` の第 3 引数に
 * そのまま渡せる形。**`current` を破壊しない。**
 */
export type Mutation = (current: NostrEvent | undefined) => EventDraft;

/**
 * 全置換ビルダの共通規則。`name` のタグだけを `next` へ差し替え、
 * **それ以外のタグと `content` は `current` のまま保つ。**
 *
 * 保つ理由: 他クライアントが立てた未知のタグを消すと、その端末の設定が
 * 黙って飛ぶ。NIP-02 は `.content` を "not used" と言うが、レガシーな
 * クライアントはリレーリストの JSON をそこに入れている。
 */
export const replaceTags = (
  current: NostrEvent | undefined,
  kind: number,
  name: string,
  next: (existing: string[][]) => string[][],
): EventDraft => {
  const tags = current?.tags ?? [];
  const existing = tags.filter((tag) => tag[0] === name);
  const others = tags.filter((tag) => tag[0] !== name);
  return {
    kind,
    tags: [...next(existing), ...others],
    content: current?.content ?? "",
  };
};
