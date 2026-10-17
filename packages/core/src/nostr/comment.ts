/**
 * NIP-22 のコメント（kind:1111）。
 *
 * - 根は大文字、親は小文字で指す（"Comments MUST point to the root scope using
 *   uppercase tag names ... and MUST point to the parent item with lowercase ones"）
 * - イベントは `["E", id, relay, pubkey]`、住所は `["A", "kind:pubkey:d", relay]`、
 *   外部の識別子は `["I", value, hint]`。`e` の 4 番目は NIP-10 と違い印ではなく作者
 * - `K` / `k` は必須（"Tags `K` and `k` MUST be present"）。作者は `P` / `p`
 *   （"Comments MUST point to the authors when one is available"）
 * - 投稿（kind:1）への返信にも使ってよくなった（2026-08 に NIP-22 から禁止の文が
 *   消えた）が、Streets は投稿へは NIP-10（`reply.ts`）で返す。理由は `buildReplyTo`
 */
import type { RelayUrl } from "../relay/relay-connection";
import { addressOfEvent, formatEventAddress } from "./address";
import type { EventDraft } from "./build/draft";
import { hashtagTags } from "./build/note";
import type { NostrEvent } from "./event";
import { type EventRef, type IdRef, idRef, relayOf } from "./event-refs";

/** 他のクライアントは kind:1 への返信にも使うことがあるので、読むときは kind を問わない。 */
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
export const commentIdOf = (
  target: CommentTarget | undefined,
): IdRef | undefined => {
  if (target?.form !== "id") return undefined;
  const { kind: _, ...ref } = target;
  return ref;
};

const COMMENT_ROOT_TAGS = new Set(["E", "A", "I", "K", "P"]);

/**
 * 1 つのイベントを指す NIP-22 の参照。住所を持つ先は住所で指し、親としては
 * 版の id も `e` で添える（NIP-22 の例どおり）。
 */
const commentRefTags = (
  target: NostrEvent,
  hint: string,
  as: "root" | "parent",
): string[][] => {
  const name = (lower: string) => (as === "root" ? lower.toUpperCase() : lower);
  const address = addressOfEvent(target);
  const e = [name("e"), target.id, hint, target.pubkey];
  const refs = address
    ? [
        [name("a"), formatEventAddress(address), hint],
        ...(as === "parent" ? [e] : []),
      ]
    : [e];
  return [
    ...refs,
    [name("k"), String(target.kind)],
    [name("p"), target.pubkey],
  ];
};

/**
 * NIP-22 のコメント。親がコメントなら親の根（大文字のタグ）をそのまま引き継ぎ、
 * そうでなければ親そのものを根にする。
 */
export const buildComment = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const root =
    parent.kind === COMMENT_KIND
      ? parent.tags
          .filter((tag) => COMMENT_ROOT_TAGS.has(tag[0] ?? ""))
          .map((tag) => [...tag])
      : commentRefTags(parent, hint, "root");
  return {
    kind: COMMENT_KIND,
    tags: [
      ...root,
      ...commentRefTags(parent, hint, "parent"),
      ...hashtagTags(content),
    ],
    content,
  };
};
