import type { NostrEvent } from "../event";

/**
 * ビルダが返すもの。**`pubkey` と `created_at` を持たない** —— 持たせると時計の
 * 取り方が各ビルダへ散り付け忘れても型が通るので、持てない形にして型で防ぐ。
 */
export type EventDraft = {
  kind: number;
  tags: string[][];
  content: string;
};

/** 置換可能イベントの差分適用。`Writer.replace` の第 3 引数にそのまま渡せる形で、**`current` を破壊しない**。 */
export type Mutation = (current: NostrEvent | undefined) => EventDraft;

/**
 * 全置換ビルダの共通規則。`name` のタグだけ差し替え、他は `current` のまま
 * 保つ —— 消すと他クライアントの未知タグ設定が飛ぶ (NIP-02 は content を "not used" と言うがレガシーはそこにリレーリストを入れる)。
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
 * タグの値を 1 本足す／落とす、kind 非依存の差分適用（意味づけは呼び出し側が
 * 持つ）。非公開項目は NIP-51/NIP-44 暗号化と署名器委譲が未対応のため、公開タグだけを扱う。
 */
export const addTagValue =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.some((tag) => tag[1] === value)
        ? existing
        : [...existing, [name, value]],
    );

export const removeTagValue =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.filter((tag) => tag[1] !== value),
    );
