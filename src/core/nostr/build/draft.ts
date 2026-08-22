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
