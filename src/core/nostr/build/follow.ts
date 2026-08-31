import type { RelayUrl } from "../../relay/relay-connection";
import { type Mutation, removeTagValue, replaceTags } from "./draft";

const FOLLOW_KIND = 3;

/**
 * NIP-02 のフォロー追加。位置要素 `["p", key, relay, petname]` は末尾へ追加
 * する (NIP-02: "should append them to maintain chronological order"。並べ替えると順序が壊れる)。
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
 * NIP-02 のフォロー解除。pubkey だけを見る単純な差分適用で `removeTagValue`
 * に収まる —— `addFollow` は relay/petname を含む 4 要素構造で共通ヘルパーに乗らない。
 */
export const removeFollow = (pubkey: string): Mutation =>
  removeTagValue(FOLLOW_KIND, "p", pubkey);
