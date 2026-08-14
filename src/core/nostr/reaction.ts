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
  // 空文字は `+` と同じ (NIP-25)。v0 はここを取り違えており、空のリアクション
  // が画面に出る。
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
