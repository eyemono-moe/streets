/**
 * NIP-10 の返信（kind:1）と、同じ書き方をする NIP-28 の発言（kind:42）。
 *
 * - 印付きの `["e", id, relay, marker, pubkey]`（"Marked "e" tags (PREFERRED)"）。
 *   `marker` は `root` か `reply`。根への直接の返信は `root` 1 本だけ（"A direct
 *   reply to the root of a thread should have a single marked "e" tag of type "root""）
 * - 印の無い位置の書き方（"Deprecated Positional "e" tags"）も読む。先頭が根、末尾が返信先
 * - `p` には親の `p` をすべてと親の作者を入れる（"the reply event's "p" tags should
 *   contain all of E's "p" tags as well as the "pubkey" of the event being replied to"）
 * - 投稿以外への返信には使わない（"Kind 1 replies MUST NOT be used to reply to other
 *   kinds, use NIP-22 instead"）。そちらはコメント（`comment.ts`）
 */
import type { RelayUrl } from "../relay/relay-connection";
import type { EventDraft } from "./build/draft";
import { hashtagTags } from "./build/note";
import {
  COMMENT_KIND,
  buildComment,
  commentIdOf,
  commentRefs,
} from "./comment";
import { parseContent } from "./content";
import type { NostrEvent } from "./event";
import { type IdRef, idRef, pubkeyOf } from "./event-refs";

/**
 * NIP-10 で位置形式の `e` タグを読む kind。kind:6（リポスト）や kind:7（リアクション）も
 * 印の無い `e` タグを持つので、位置で読むとそれらが返信になってしまう。
 * kind:42（NIP-28 の発言）は NIP-10 の書き方に従う。
 */
const POSITIONAL_KINDS = new Set([1, 42]);

/**
 * 本文で指している投稿の id と、`#[n]`（NIP-08 の古い言及）で指すタグの位置（`#n`）。
 * 位置形式の返信先を決めるときだけ使う。
 */
const mentionedInContent = (event: NostrEvent): Set<string> => {
  const mentioned = new Set<string>();
  for (const match of event.content.matchAll(/#\[(\d+)\]/g)) {
    mentioned.add(`#${match[1]}`);
  }
  if (!event.content.includes("nostr:")) return mentioned;
  for (const token of parseContent(event.content, event.tags)) {
    if (token.type !== "mention") continue;
    if (token.ref.kind === "note" || token.ref.kind === "nevent") {
      mentioned.add(token.ref.id);
    }
  }
  return mentioned;
};

/**
 * 印（`root` / `reply`）の付いた `e` タグが 1 本も無いときだけ、印の無い `e` タグを
 * 位置で読む（NIP-10 の古い書き方。互換のために残すとされている）。先頭が根、
 * 末尾が返信先。印付きが 1 本でもあれば `undefined`（印だけで決める）。
 * `mention` の印が付いたものは返信ではないので数えない。
 */
const positionalRefs = (event: NostrEvent): IdRef[] | undefined => {
  if (!POSITIONAL_KINDS.has(event.kind)) return undefined;
  const refs: IdRef[] = [];
  let mentioned: Set<string> | undefined;
  for (const [index, tag] of event.tags.entries()) {
    if (tag[0] !== "e") continue;
    const marker = tag[3];
    if (marker === "root" || marker === "reply") return undefined;
    if (marker === "mention") continue;
    // 古い書き方では、本文で引用した投稿にも印の無い `e` タグを付けていた。
    // 本文で指しているものは言及であって返信先ではない。
    mentioned ??= mentionedInContent(event);
    if (mentioned.has(tag[1] ?? "") || mentioned.has(`#${index}`)) continue;
    // 4 番目と 5 番目を取り違えたもの（`["e", id, relay, pubkey, "root"]`）もあるので、
    // 4 番目が pubkey ならそれを使う。
    const ref = idRef(tag[1] ?? "", tag[2], pubkeyOf(marker) ? marker : tag[4]);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * 返信先（親）の id を返す。`reply` の印があればそれ、無ければ `root`（root タグは
 * 1 本だけの決まり）。NIP-10 ではどちらの印も省けるので、印付きが 1 本も無ければ
 * 位置で読む（`positionalRefs`）。コメントなら小文字の `e`。親が記事などの住所や
 * 外部の識別子なら `undefined` になるので、返信かどうかは `isReply` で見る。
 */
export const replyTarget = (event: NostrEvent): IdRef | undefined => {
  if (event.kind === COMMENT_KIND)
    return commentIdOf(commentRefs(event)?.parent);
  const positional = positionalRefs(event);
  if (positional) return positional.at(-1);
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
 * スレッドの根の id を返す。`root` の印のもの、印付きが無ければ位置で読んだ先頭。
 * `replyTarget` は `reply` 優先で深い返信では根を取れないため別経路が要る。
 * `root` の印が無く `reply` だけの返信では根が分からず `undefined`（呼ぶ側が親を
 * たどる）。`undefined` 時も自分の id は返さない。
 * コメントなら大文字の `E` —— 返信への返信になったコメントは、根を `E` でしか指さない。
 */
export const threadRoot = (event: NostrEvent): IdRef | undefined => {
  if (event.kind === COMMENT_KIND) return commentIdOf(commentRefs(event)?.root);
  const positional = positionalRefs(event);
  if (positional) return positional[0];
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
 * 親のスレッドの根を指す `root` の `e` タグ。無ければ親自身が根。親のタグを
 * 写さずに読み直すのは、親が古い位置の書き方（印の無い `e` タグ）で書かれて
 * いても根を引き継ぐため。写すと親を根にしてしまい、スレッドが割れる。
 */
const rootTagOf = (parent: NostrEvent): string[] | undefined => {
  const root = threadRoot(parent);
  if (!root) return undefined;
  return [
    "e",
    root.id,
    root.relay ?? "",
    "root",
    ...(root.pubkey ? [root.pubkey] : []),
  ];
};

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
/**
 * 返信を、親に合わせた形で書く。投稿（kind:1）には NIP-10 の返信、それ以外には
 * コメント（NIP-10: "Kind 1 replies MUST NOT be used to reply to other kinds"）。
 * NIP-22 は投稿へのコメントも許すようになったが、コメントを表示できないクライアントが
 * まだ多く、そこから返信が見えなくなるので投稿どうしは kind:1 で返す。
 */
export const buildReplyTo = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft =>
  parent.kind === 1
    ? buildReply(parent, content, options)
    : buildComment(parent, content, options);
