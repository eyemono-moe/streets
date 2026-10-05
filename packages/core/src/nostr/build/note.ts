import type { RelayUrl } from "../../relay/relay-connection";
import { addressOfEvent, formatEventAddress } from "../address";
import { parseContent } from "../content";
import type { NostrEvent } from "../event";
import { encodeEventPointer, pointsTo } from "../event-pointer";
import { COMMENT_KIND } from "../event-refs";
import type { EventDraft } from "./draft";

/**
 * kind:1 の本文のハッシュタグを `t` タグにする。`parseContent` が
 * NIP-24 に合わせて小文字へ寄せるので、ここでは重複だけを落とす。
 */
const hashtagTags = (content: string): string[][] =>
  [
    ...new Set(
      parseContent(content, []).flatMap((token) =>
        token.type === "hashtag" ? [token.tag] : [],
      ),
    ),
  ].map((tag) => ["t", tag]);

/**
 * 新しいノート。`t` タグを付けるのは、付けないと本文に `#nostr` と書いても
 * ハッシュタグのカラムに出ないため（カラムは `#t` フィルタで集める）。
 */
export const buildNote = (content: string): EventDraft => ({
  kind: 1,
  tags: hashtagTags(content),
  content,
});

/** 親が持つ `root` マーカー付きの `e` タグ。無ければ親自身が根。 */
const rootTagOf = (parent: NostrEvent): string[] | undefined =>
  parent.tags.find((tag) => tag[0] === "e" && tag[3] === "root");

/**
 * NIP-10 の返信。マーカー付き `e` タグ `["e", id, relay-url, marker, pubkey]`
 * を使う（positional 形式は NIP-10 で deprecated）。relay-url が無くても空文字
 * で埋める —— 省略すると marker が relay-url 位置にずれ "root" へ接続される。
 * 自分を `p` から落とさない（`pubkey` 未受領で判定不能、実害は小さい）。
 */
export const buildReply = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const root = rootTagOf(parent);

  // NIP-10: "A direct reply to the root of a thread should have a single marked 'e' tag of type 'root'."
  const e = root
    ? [root, ["e", parent.id, hint, "reply", parent.pubkey]]
    : [["e", parent.id, hint, "root", parent.pubkey]];

  // NIP-10: "the reply event's 'p' tags should contain all of E's 'p' tags as well as the pubkey of the event being replied to."
  const pubkeys = new Set<string>([parent.pubkey]);
  for (const tag of parent.tags) {
    if (tag[0] === "p" && tag[1]) pubkeys.add(tag[1]);
  }

  return {
    kind: 1,
    tags: [
      ...e,
      ...[...pubkeys].map((pubkey) => ["p", pubkey]),
      ...hashtagTags(content),
    ],
    content,
  };
};

/** コメントの根として引き継ぐタグ（NIP-22 の大文字）。 */
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

/**
 * 返信を、親に合わせた形で書く。投稿（kind:1）には NIP-10 の返信、それ以外には
 * コメント。投稿にもコメントで返すクライアントはあるが、コメントを表示できない
 * クライアントがまだ多く、そこから返信が見えなくなるので投稿どうしは kind:1 で返す。
 */
export const buildReplyTo = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft =>
  parent.kind === 1
    ? buildReply(parent, content, options)
    : buildComment(parent, content, options);

/**
 * NIP-18 の引用。`e` タグは立てない（NIP-18: "quote reposts will not be shown
 * in the feed as replies"）。住所を持つ先は `q` も住所で指す —— 本文の `naddr`
 * と揃えないと、読む側で同じ引用が 2 つ描かれる。
 *
 * 引用先の作者への `p` はここでは付けない。本文で引用したものと同じく、
 * `withReferences` が設定に従って `q` から付ける。
 */
export const buildQuote = (
  target: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const address = addressOfEvent(target);
  const q = address
    ? ["q", formatEventAddress(address), hint]
    : ["q", target.id, hint, target.pubkey];
  // 貼り付けたリンクはリレーの違いで文字列が変わるので、指している先で比べる。
  const quoted = parseContent(content, []).some(
    (token) => token.type === "mention" && pointsTo(token.ref, target),
  );
  const uri = `nostr:${encodeEventPointer(target, hint ? [hint] : [])}`;
  return {
    kind: 1,
    tags: [q, ...hashtagTags(content)],
    content: quoted ? content : `${content}\n\n${uri}`,
  };
};
