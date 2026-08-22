import type { RelayUrl } from "../../relay/relay-connection";
import { type Mutation, replaceTags } from "./draft";

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

/** NIP-02 のフォロー解除。該当する `p` タグだけを落とす。 */
export const removeFollow =
  (pubkey: string): Mutation =>
  (current) =>
    replaceTags(current, FOLLOW_KIND, "p", (existing) =>
      existing.filter((tag) => tag[1] !== pubkey),
    );
