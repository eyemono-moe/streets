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

/**
 * タグ名の位置要素 2 番目 (値) 1 本を足す／落とす、kind に依存しない差分
 * 適用。`kind`・タグ名・値の意味づけは一切ここに無く、すべて呼び出し側
 * (`mute.ts`/`bookmark.ts`/`follow.ts` の `removeFollow`) が持つ ——
 * ADR-0004 の判定基準（「この kind のこのタグは何を意味するか」を
 * 含むなら kind 側、含まないなら置き場所は素直さと正しさで決めてよい）を
 * 当てると、この 2 関数はどちらにも当てはまらない。
 *
 * 元は NIP-51 のリスト系 (kind:10000 のミュート、kind:10003 の
 * ブックマーク) のために書かれたが、この事実そのものは判定基準の埒外 ——
 * 「NIP-51 由来だから NIP-51 側に置く」は判定基準ではなく由来の話でしか
 * ない。ADR-0004 の 2 回目の誤読（followers/list を参照）の記録どおり、
 * 由来で判断すると同じ間違いを繰り返す。
 *
 * **公開タグだけを扱う。** 非公開項目は `content` を NIP-44 で暗号化する
 * 必要があり (NIP-51)、鍵を持たないこのアプリでは署名器への委譲が要る
 * (`Nip44UnavailableError`)。使う面がまだ無いので、テストで守れない実装を
 * 先に置かない。
 */
export const addTagValue =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.some((tag) => tag[1] === value)
        ? existing
        : [...existing, [name, value]],
    );

/** {@link addTagValue} の逆演算。該当する値のタグだけを落とす。 */
export const removeTagValue =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.filter((tag) => tag[1] !== value),
    );
