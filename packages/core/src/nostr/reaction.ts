/**
 * NIP-25 のリアクション（kind:7）。
 *
 * - `e` は必須で、対象を最後に置く（"There MUST be always an `e` tag set to the `id` of the
 *   event that is being reacted to ... the target event `id` should be last of the `e` tags"）
 * - 形は NIP-01 の `["e", id, relay, pubkey]`（"The `e` and `a` tags SHOULD include relay
 *   and pubkey hints"）。住所を持つ先には `a` も添える（"an `a` SHOULD be included together
 *   with the `e` tag"）
 * - 作者を `["p", pubkey, relay]` に入れる（"There SHOULD be a `p` tag"、"The `p` tags
 *   SHOULD include relay hints"）
 * - `content` の `+` と空文字は「いいね」
 */
import type { RelayUrl } from "../relay/relay-connection";
import { addressOfEvent, formatEventAddress } from "./address";
import type { EventDraft } from "./build/draft";
import type { NostrEvent } from "./event";

const REACTION_KIND = 7;
/** NIP-01 の id / pubkey は 32 バイトの小文字 hex 表現である。 */
const HEX_64 = /^[0-9a-f]{64}$/;

export type ReactionContent =
  | { type: "like" }
  | { type: "emoji"; name: string; url: string }
  | { type: "text"; content: string };

export type ParsedReaction = {
  content: ReactionContent;
  targetId: string;
  /** NIP-25 の `p` は SHOULD。付けないクライアントが実在するので省略可能。 */
  targetPubkey?: string;
};

/** 同じ種類のタグのうち**最後**を返す。NIP-25 はスレッドの祖先を前に並べ、
 *  対象そのものを最後に置くと定めている。 */
const lastTagValue = (event: NostrEvent, name: string): string | undefined => {
  let found: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] !== name) continue;
    const value = tag[1];
    if (value && HEX_64.test(value)) found = value;
  }
  return found;
};

const emojiContent = (event: NostrEvent): ReactionContent | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "emoji") continue;
    const name = tag[1];
    const url = tag[2];
    // 本文が `:name:` そのものでなければ、この emoji タグは content が指す
    // ものではない (NIP-30 は本文中の複数ショートコードも許すが、
    // リアクションの content は 1 つのショートコードだけ)。
    if (!name || !url || event.content !== `:${name}:`) continue;
    return { type: "emoji", name, url };
  }
  return undefined;
};

/**
 * kind:7 を描ける形へ落とす。**例外を投げない** —— 1 件の壊れたイベントで
 * カラム全体が落ちないようにするため、解釈できないものは `undefined`。
 */
export const parseReaction = (
  event: NostrEvent,
): ParsedReaction | undefined => {
  if (event.kind !== REACTION_KIND) return undefined;
  const targetId = lastTagValue(event, "e");
  if (!targetId) return undefined;

  const emoji = emojiContent(event);
  // 空文字は `+` と同じ (NIP-25)。ここを取り違えると、空のリアクションが
  // 画面に出る。
  const content: ReactionContent =
    emoji ??
    (event.content === "+" || event.content === ""
      ? { type: "like" }
      : { type: "text", content: event.content });

  const targetPubkey = lastTagValue(event, "p");
  return targetPubkey
    ? { content, targetId, targetPubkey }
    : { content, targetId };
};

export type ReactionInput =
  | { type: "like" }
  | { type: "text"; content: string }
  | { type: "emoji"; shortcode: string; url: string };

/**
 * NIP-25 のリアクション。`k` タグは NIP-25 上は MAY だが必ず入れる ——
 * 読み取り側の `parseReaction` が既に見ており、落とすと自分で書いたものを自分で読めなくなる。
 */
export const buildReaction = (
  target: NostrEvent,
  input: ReactionInput,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const address = addressOfEvent(target);
  const tags: string[][] = [
    ["e", target.id, hint, target.pubkey],
    // NIP-25: 住所を持つ先には `a` も添える。版が変わっても同じものへの反応として数えられる。
    ...(address ? [["a", formatEventAddress(address), hint]] : []),
    ["p", target.pubkey, hint],
    ["k", String(target.kind)],
  ];
  if (input.type === "emoji") {
    tags.push(["emoji", input.shortcode, input.url]);
  }
  return {
    kind: 7,
    tags,
    content:
      input.type === "like"
        ? "+"
        : input.type === "text"
          ? input.content
          : // NIP-25: "The content can be set only one `:shortcode:`." 飾りを足すと他クライアントが素のテキストとして描く
            `:${input.shortcode}:`,
  };
};
