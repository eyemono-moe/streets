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

/** NIP-22 のコメント。kind:1 以外への返信と、一部のクライアントでは kind:1 への返信にも使われる。 */
export const COMMENT_KIND = 1111;

/**
 * コメントが指す先。`kind` は `K`/`k` タグの値で、イベントなら数、外部の
 * 識別子（NIP-73）なら `web` や `#` などの文字列。
 */
export type CommentTarget =
  | (IdRef & { kind?: number })
  | (Extract<EventRef, { form: "address" }> & { kind?: number })
  | { form: "external"; value: string; hint?: string; kind?: string };

export type CommentRefs = {
  root: CommentTarget | undefined;
  parent: CommentTarget | undefined;
};

const eventKindOf = (value: string | undefined): number | undefined =>
  value && /^\d+$/.test(value) ? Number(value) : undefined;

/**
 * NIP-22 の参照を 1 組（根なら `E`/`A`/`I`/`K`、親なら小文字）読む。
 * 記事のように `A` と `E` を両方持つ先は `A` を採る —— 書き直しても同じ先を指し続けるため。
 */
const commentTarget = (
  event: NostrEvent,
  names: { e: string; a: string; i: string; k: string },
): CommentTarget | undefined => {
  const find = (name: string) => event.tags.find((tag) => tag[0] === name);
  const kindValue = find(names.k)?.[1];
  const kind = eventKindOf(kindValue);

  const a = find(names.a);
  if (a?.[1]?.includes(":")) {
    const ref: CommentTarget = { form: "address", address: a[1] };
    const relay = relayOf(a[2]);
    if (relay) ref.relay = relay;
    if (kind !== undefined) ref.kind = kind;
    return ref;
  }
  const e = find(names.e);
  // NIP-22 の `e` は `["e", id, relay, pubkey]`。NIP-10 と違い 4 番目は marker ではない。
  const ref = e ? idRef(e[1] ?? "", e[2], e[3]) : undefined;
  if (ref) return kind === undefined ? ref : { ...ref, kind };
  const i = find(names.i);
  if (i?.[1]) {
    const external: CommentTarget = { form: "external", value: i[1] };
    if (i[2]) external.hint = i[2];
    if (kindValue) external.kind = kindValue;
    return external;
  }
  return undefined;
};

/** コメント（kind:1111）の根と親。コメントでなければ `undefined`。 */
export const commentRefs = (event: NostrEvent): CommentRefs | undefined =>
  event.kind === COMMENT_KIND
    ? {
        root: commentTarget(event, { e: "E", a: "A", i: "I", k: "K" }),
        parent: commentTarget(event, { e: "e", a: "a", i: "i", k: "k" }),
      }
    : undefined;

/**
 * コメントの参照先が id ならその id。記事のように住所を持つ先は、`e` で版の id も
 * 添えられるが、指しているのは住所の方なので id としては返さない。
 */
const commentIdOf = (target: CommentTarget | undefined): IdRef | undefined => {
  if (target?.form !== "id") return undefined;
  const { kind: _, ...ref } = target;
  return ref;
};

/**
 * 返信先（親）の id を返す。marker は "reply"/"root" のみ（旧位置形式は NIP-10 で
 * deprecated）。`reply` が無ければ `root`（root タグは 1 本だけの決まり）。
 * コメントなら小文字の `e`。親が記事などの住所や外部の識別子なら `undefined` に
 * なるので、返信かどうかは `isReply` で見る。
 */
export const replyTarget = (event: NostrEvent): IdRef | undefined => {
  if (event.kind === COMMENT_KIND)
    return commentIdOf(commentRefs(event)?.parent);
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
 * スレッドの根の id を返す（`root` タグのみ）。`replyTarget` は `reply` 優先で深い
 * 返信では根を取れないため別経路が要る。`undefined` 時も自分の id は返さない。
 * コメントなら大文字の `E` —— 返信への返信になったコメントは、根を `E` でしか指さない。
 */
export const threadRoot = (event: NostrEvent): IdRef | undefined => {
  if (event.kind === COMMENT_KIND) return commentIdOf(commentRefs(event)?.root);
  for (const tag of event.tags) {
    if (tag[0] !== "e" || tag[3] !== "root") continue;
    const ref = idRef(tag[1] ?? "", tag[2], tag[4]);
    if (ref) return ref;
  }
  return undefined;
};

/** 何かへの返信か。コメントは必ず何かへの返信。 */
export const isReply = (event: NostrEvent): boolean =>
  event.kind === COMMENT_KIND || replyTarget(event) !== undefined;

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
