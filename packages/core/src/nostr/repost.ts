/**
 * NIP-18 のリポスト（kind:6）と汎用リポスト（kind:16）。
 *
 * - `e` タグは必須で、3 番目にリレー URL を入れる（"The repost event MUST include an
 *   `e` tag with the `id` of the note that is being reposted. That tag MUST include a
 *   relay URL as its third entry"）。印は定めないので、形は NIP-01 の
 *   `["e", id, relay, pubkey]`
 * - 作者を `p` タグに入れる（"The repost SHOULD include a `p` tag with the `pubkey`"）
 * - `content` は元の投稿の JSON。NIP-70 で保護された投稿は埋め込まない（"Reposts of
 *   protected events MUST NOT embed the reposted event"）
 * - 汎用リポストが置換可能なイベントを指すときは `a` タグも付く（"When reposting a
 *   replaceable event, the repost SHOULD include an `"a"` tag with the event coordinate
 *   (`kind:pubkey:d-tag`) of the reposted event."）。`a` が無ければ、その版を指している
 *   （"If the `"a"` tag is not present, it indicates that a specific version of a
 *   replaceable event is being reposted"）
 * - 汎用リポストは `k` タグに元の kind を入れる（"`kind 16` reposts SHOULD contain a `"k"`
 *   tag with the stringified kind number of the reposted event as its value."）
 */
import type { RelayUrl } from "../relay/relay-connection";
import {
  addressOfEvent,
  formatEventAddress,
  parseEventAddress,
} from "./address";
import type { EventDraft } from "./build/draft";
import { type NostrEvent, isNostrEvent } from "./event";
import {
  type EventRef,
  type IdRef,
  idRef,
  pubkeyOf,
  relayOf,
} from "./event-refs";

export const GENERIC_REPOST_KIND = 16;

/**
 * リポスト対象の `e` タグ。例外を投げない —— `e` タグの無いリポストも実在し、
 * 1 件の不正なイベントでカラム全体を壊さない。
 *
 * NIP-10 の印付きの形（`["e", id, relay, "", pubkey]`）で書くクライアントもあるので
 * 5 番目も見る。どちらにも無ければ `p` タグから補う。
 */
export const repostTarget = (event: NostrEvent): IdRef | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "e") continue;
    const author =
      pubkeyOf(tag[3]) ??
      pubkeyOf(tag[4]) ??
      event.tags.find((p) => p[0] === "p" && pubkeyOf(p[1]))?.[1];
    const ref = idRef(tag[1] ?? "", tag[2], author);
    if (ref) return ref;
  }
  return undefined;
};

/**
 * 汎用リポスト（kind:16）が `a` タグで指す住所。版ではなく住所を指しているので、
 * `e` タグがあってもこちらで引く —— 置換されたあとの古い版は、リレーから消えている。
 */
export const repostAddress = (
  event: NostrEvent,
): Extract<EventRef, { form: "address" }> | undefined => {
  if (event.kind !== GENERIC_REPOST_KIND) return undefined;
  for (const tag of event.tags) {
    if (tag[0] !== "a") continue;
    const address = parseEventAddress(tag[1]);
    if (!address) continue;
    const relay = relayOf(tag[2]);
    return {
      form: "address",
      address: formatEventAddress(address),
      ...(relay ? { relay } : {}),
    };
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

/**
 * NIP-70 の印。付いたイベントは作者しかリレーへ出せない。印は `["-"]` と決まって
 * いるが、値の付いたものも保護とみなす —— 埋め込まなくても取りに行けば読める一方、
 * 埋め込んで断られるとリポストそのものが届かない。
 */
const isProtected = (event: NostrEvent): boolean =>
  event.tags.some((tag) => tag[0] === "-");

/**
 * 汎用リポストで指せない kind。リポストそのもの・削除依頼は広めるものではない。
 * 置換可能（0・3・10000 番台）は住所が `kind:pubkey:` の形になり、読む側の
 * `parseEventAddress` が扱わない。どれもリストや設定で、人に広めるものでもない。
 * 一時的なイベント（20000 番台）はリレーに残らず、指しても取りに行けない。
 */
const isGenericRepostable = (kind: number): boolean =>
  kind !== 5 &&
  kind !== 6 &&
  kind !== GENERIC_REPOST_KIND &&
  kind !== 0 &&
  kind !== 3 &&
  !(kind >= 10_000 && kind < 30_000);

/**
 * 投稿（kind:1）は kind:6、ほかは汎用リポスト（kind:16）で書く。指せない kind は
 * `undefined`。
 *
 * 返信ではないので NIP-10 の印の位置を空けない —— 空けると、NIP-01 どおりに
 * 読む側には作者が `""` に見える。
 *
 * 住所を持つ先でも `content` に埋め込む。NIP-18 は `a` があれば埋め込みを求めないが、
 * 埋め込めば読む側はリレーへ取りに行かずに描ける。
 */
export const buildRepost = (
  target: NostrEvent,
  options?: { relayHint?: RelayUrl },
): EventDraft | undefined => {
  if (target.kind !== 1 && !isGenericRepostable(target.kind)) return undefined;
  const hint = options?.relayHint ?? "";
  // 保護された投稿を埋め込むと、作者以外が出せないはずのイベントを他のリレーへ運ぶことになり、リレーにも断られる。
  const content = isProtected(target) ? "" : JSON.stringify(target);
  const e = ["e", target.id, hint, target.pubkey];
  const p = ["p", target.pubkey];
  if (target.kind === 1) return { kind: 6, content, tags: [e, p] };
  const address = addressOfEvent(target);
  return {
    kind: GENERIC_REPOST_KIND,
    content,
    tags: [
      e,
      ...(address ? [["a", formatEventAddress(address), hint]] : []),
      ["k", String(target.kind)],
      p,
    ],
  };
};
