import type { RelayUrl } from "../relay/relay-connection";
import type { NostrEvent } from "./event";

/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 他のイベントへの参照。`q` タグは event-address (`kind:pubkey:d`) も運べる
 * ため id 形式と区別する —— 混ぜると `{ ids: [...] }` で永久に見つからない。
 */
export type EventRef =
  | { form: "id"; id: string; relay?: RelayUrl; pubkey?: string }
  | { form: "address"; address: string; relay?: RelayUrl };

export type IdRef = Extract<EventRef, { form: "id" }>;

/**
 * 空文字を落とす。NIP-10 はリレー URL を「may be empty string」と明記しており、
 * そのまま渡すと空文字が接続先として使われうる。
 */
export const relayOf = (value: string | undefined): RelayUrl | undefined =>
  value && value.length > 0 ? (value as RelayUrl) : undefined;

export const pubkeyOf = (value: string | undefined): string | undefined =>
  value && HEX_64.test(value) ? value : undefined;

export const idRef = (
  id: string,
  relay?: string,
  pubkey?: string,
): IdRef | undefined => {
  if (!HEX_64.test(id)) return undefined;
  const ref: IdRef = { form: "id", id };
  const r = relayOf(relay);
  if (r) ref.relay = r;
  const p = pubkeyOf(pubkey);
  if (p) ref.pubkey = p;
  return ref;
};

/**
 * 本文の `note` / `nevent` が指す先。`nevent` が運ぶリレーと作者も持ち回る
 * （読む側はリレーで見つからなければ作者の書き込みリレーへ聞き直す）。
 */
export const idRefOfPointer = (
  ref:
    | { kind: "note"; id: string }
    | {
        kind: "nevent";
        id: string;
        relays: readonly string[];
        author?: string;
      },
): IdRef | undefined =>
  ref.kind === "note"
    ? idRef(ref.id)
    : idRef(ref.id, ref.relays[0], ref.author);

/**
 * `e` タグが運ぶリレーヒントを重複無しで返す（`#e` 購読は返信者が事前に分から
 * ず著者の write relay も引けないため）。marker は問わず引用専用タグも拾う。
 */
export const eventRelayHints = (event: NostrEvent): RelayUrl[] => {
  const hints = new Set<RelayUrl>();
  for (const tag of event.tags) {
    // コメント（NIP-22）の根は大文字の `E` にしかない。
    if (tag[0] !== "e" && tag[0] !== "E") continue;
    const hint = relayOf(tag[2]);
    if (hint) hints.add(hint);
  }
  return [...hints];
};
