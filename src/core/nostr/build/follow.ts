import type { RelayUrl } from "../../relay/relay-connection";
import { type Mutation, removeTagValue, replaceTags } from "./draft";

const FOLLOW_KIND = 3;

/**
 * NIP-02 のフォロー追加。位置要素は
 * `["p", <32-bytes hex key>, <main relay URL>, <petname>]`。
 *
 * **末尾へ追加する。** NIP-02 は "clients should append them to maintain
 * chronological order" と定めており、並べ替えると全クライアントで
 * フォロー順が壊れる。
 */
export const addFollow =
  (
    pubkey: string,
    options?: { relay?: RelayUrl; petname?: string },
  ): Mutation =>
  (current) =>
    replaceTags(current, FOLLOW_KIND, "p", (existing) =>
      existing.some((tag) => tag[1] === pubkey)
        ? existing
        : [
            ...existing,
            ["p", pubkey, options?.relay ?? "", options?.petname ?? ""],
          ],
    );

/**
 * NIP-02 のフォロー解除。該当する `p` タグだけを落とす。
 *
 * `addFollow` と違い、こちらは位置要素 2 番目 (pubkey) だけを見て判定する
 * 単純な差分適用で、`removeTagValue` (`draft.ts`) が `mute.ts`/`bookmark.ts`
 * と共有する同じ形にそのまま収まる。`addFollow` を分けたままにしているのは
 * NIP-02 の `p` タグが `relay`/`petname` を含む 4 要素の位置構造を持ち、
 * 2 要素だけの共通ヘルパーでは表現できないため —— こちらは非対称で正しい。
 */
export const removeFollow = (pubkey: string): Mutation =>
  removeTagValue(FOLLOW_KIND, "p", pubkey);
