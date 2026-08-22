import { type Mutation, replaceTags } from "./draft";

/**
 * NIP-51 のリスト共通。1 つのタグ名の中で値を足す／落とす。
 *
 * **このモジュールは公開項目 (`tags`) だけを扱う。** 非公開項目は
 * `content` を NIP-44 で暗号化する必要があり (NIP-51)、鍵を持たない
 * このアプリでは署名器への委譲が要る (`Nip44UnavailableError`)。使う面が
 * まだ無いので、テストで守れない実装を先に置かない。
 */
export const addToList =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.some((tag) => tag[1] === value)
        ? existing
        : [...existing, [name, value]],
    );

export const removeFromList =
  (kind: number, name: string, value: string): Mutation =>
  (current) =>
    replaceTags(current, kind, name, (existing) =>
      existing.filter((tag) => tag[1] !== value),
    );
