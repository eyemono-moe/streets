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
 */
import type { RelayUrl } from "../relay/relay-connection";
import type { EventDraft } from "./build/draft";
import { type NostrEvent, isNostrEvent } from "./event";
import { type IdRef, idRef, pubkeyOf } from "./event-refs";

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
 * `kind:1` 以外は `undefined`（kind:6 は kind:1 専用。kind:16 は使う面がまだ無い）。
 *
 * 返信ではないので NIP-10 の印の位置を空けない —— 空けると、NIP-01 どおりに
 * 読む側には作者が `""` に見える。
 */
export const buildRepost = (
  target: NostrEvent,
  options?: { relayHint?: RelayUrl },
): EventDraft | undefined => {
  if (target.kind !== 1) return undefined;
  return {
    kind: 6,
    // 保護された投稿を埋め込むと、作者以外が出せないはずのイベントを他のリレーへ運ぶことになり、リレーにも断られる。
    content: isProtected(target) ? "" : JSON.stringify(target),
    tags: [
      ["e", target.id, options?.relayHint ?? "", target.pubkey],
      ["p", target.pubkey],
    ],
  };
};
