import type { RelayUrl } from "../relay/relay-connection";
import { parseContent } from "./content";
import { type NostrEvent, isNostrEvent } from "./event";

/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 他のイベントへの参照。`q` タグは event-address (`kind:pubkey:d`) も運べる
 * ため id 形式と区別する —— 混ぜると `{ ids: [...] }` で永久に見つからない。
 */
export type EventRef =
  | { form: "id"; id: string; relay?: RelayUrl; pubkey?: string }
  | { form: "address"; address: string; relay?: RelayUrl };

type IdRef = Extract<EventRef, { form: "id" }>;

/**
 * 空文字を落とす。NIP-10 はリレー URL を「may be empty string」と明記しており、
 * そのまま渡すと空文字が接続先として使われうる。
 */
export const relayOf = (value: string | undefined): RelayUrl | undefined =>
  value && value.length > 0 ? (value as RelayUrl) : undefined;

const pubkeyOf = (value: string | undefined): string | undefined =>
  value && HEX_64.test(value) ? value : undefined;

const idRef = (
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
 * 返信先（親）を返す。marker は "reply"/"root" のみ（旧位置形式は NIP-10 で
 * deprecated）。`reply` が無ければ `root`（root タグは 1 本だけの決まり）。
 */
export const replyTarget = (event: NostrEvent): IdRef | undefined => {
  let root: IdRef | undefined;
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const marker = tag[3];
    if (marker !== "reply" && marker !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (!ref) continue;
    if (marker === "reply") return ref;
    root ??= ref;
  }
  return root;
};

/**
 * スレッドの根を返す（`root` タグのみ）。`replyTarget` は `reply` 優先で深い
 * 返信では根を取れないため別経路が要る。`undefined` 時も自分の id は返さない。
 */
export const threadRoot = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e" || tag[3] !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
};

/**
 * `e` タグが運ぶリレーヒントを重複無しで返す（`#e` 購読は返信者が事前に分から
 * ず著者の write relay も引けないため）。marker は問わず引用専用タグも拾う。
 */
export const eventRelayHints = (event: NostrEvent): RelayUrl[] => {
  const hints = new Set<RelayUrl>();
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const hint = relayOf(tag[2]);
    if (hint) hints.add(hint);
  }
  return [...hints];
};

/**
 * 引用先を順に返す。`e` タグは拾わない —— NIP-18 が `q` タグを作った目的は
 * 「引用をスレッドの返信として現れさせない」ことなので、混ぜると逆流する。
 */
export const quoteTargets = (event: NostrEvent): EventRef[] => {
  const refs: EventRef[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "q") continue;
    const value = tag[1] ?? "";
    if (value.includes(":")) {
      const ref: EventRef = { form: "address", address: value };
      const r = relayOf(tag[2]);
      if (r) ref.relay = r;
      refs.push(ref);
      continue;
    }
    const ref = idRef(value, tag[2], tag[3]);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * `q` タグのうち本文に `nostr:` として現れないものを返す（本文側は
 * `NoteContent` の `eventRefs` が描画）。NIP-18 は本文言及の `q` タグ化を
 * MUST、NIP-27 は任意とし本文とタグが双方向にずれるため「タグにしか
 * 無いもの」を出し、id/address（naddr の 3 つ組と一致）とも重複は先勝ち。
 */
export const tagOnlyQuoteTargets = (event: NostrEvent): EventRef[] => {
  const mentionedIds = new Set<string>();
  const mentionedAddresses = new Set<string>();
  for (const token of parseContent(event.content, event.tags)) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind === "note" || ref.kind === "nevent") {
      mentionedIds.add(ref.id);
    } else if (ref.kind === "naddr") {
      mentionedAddresses.add(
        `${ref.eventKind}:${ref.pubkey}:${ref.identifier}`,
      );
    }
  }

  const seenIds = new Set<string>();
  const seenAddresses = new Set<string>();
  const refs: EventRef[] = [];
  for (const ref of quoteTargets(event)) {
    if (ref.form === "id") {
      if (mentionedIds.has(ref.id) || seenIds.has(ref.id)) continue;
      seenIds.add(ref.id);
    } else {
      if (
        mentionedAddresses.has(ref.address) ||
        seenAddresses.has(ref.address)
      ) {
        continue;
      }
      seenAddresses.add(ref.address);
    }
    refs.push(ref);
  }
  return refs;
};

/**
 * リポスト対象の `e` タグ。例外を投げない —— NIP-18 は kind:6 に `e` タグを
 * 要求するが守らないイベントも実在し、1 件の不正なイベントでカラム全体を壊さない。
 */
export const repostTarget = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
};

/**
 * リポストの `content` に埋め込まれた対象イベント（NIP-18）。信用できない
 * 値なので形だけ確認し、署名検証は呼び出し側の `EventStore.put` に委ねる
 * （`"rejected"` なら埋め込みを捨て `e` タグから引き直す）。
 */
export const embeddedRepostEvent = (
  event: NostrEvent,
): NostrEvent | undefined => {
  // 空文字を早期に弾く。消しても、空文字は JSON.parse が投げ try/catch が拾って
  // undefined になるため観測できないが、「content が無い」意図を例外送出任せにせずコードで明示するために残す。
  if (event.content.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return undefined;
  }
  return isNostrEvent(parsed) ? parsed : undefined;
};
