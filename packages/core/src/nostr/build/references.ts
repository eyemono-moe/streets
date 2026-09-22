import { parseContent } from "../content";
import type { EventDraft } from "./draft";

/** 自分の絵文字から、ショートコードの画像を引く。無ければ `undefined`。 */
export type EmojiLookup = (shortcode: string) => string | undefined;

/** 本文に書かれた `:shortcode:`。NIP-30 の文字だけを拾う。 */
const SHORTCODE_IN_TEXT = /:([A-Za-z0-9_-]+):/g;

/** 本文に出てくるショートコードを、出てきた順に重ねずに返す。 */
export const shortcodesIn = (texts: readonly string[]): string[] => {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(SHORTCODE_IN_TEXT)) {
      if (match[1] !== undefined) found.add(match[1]);
    }
  }
  return [...found];
};

/**
 * 本文で指している人（`nostr:npub` / `nostr:nprofile`、裸の npub も）。
 * nprofile に添えたリレーは `p` タグのヒントに使う。
 */
const mentionedPeople = (
  content: string,
): { pubkey: string; relay?: string }[] => {
  const people = new Map<string, string | undefined>();
  for (const token of parseContent(content, [])) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind !== "npub" && ref.kind !== "nprofile") continue;
    const relay = ref.kind === "nprofile" ? ref.relays[0] : undefined;
    if (!people.has(ref.pubkey) || people.get(ref.pubkey) === undefined) {
      people.set(ref.pubkey, relay);
    }
  }
  return [...people].map(([pubkey, relay]) => ({ pubkey, relay }));
};

/**
 * 本文から `p` と `emoji` のタグを足す。補完で選んだかどうかによらず本文から
 * 作る —— 貼り付けたものや手で打ったものにも付き、隠れた状態を持たずに済む。
 *
 * - 本文で指した人に `p`（NIP-27）。既に `p` があれば足さない（返信先など）
 * - 自分の絵文字にある `:shortcode:` に `emoji`（NIP-30）。無いものは付けない
 *   —— 付けないと、読む側では `:shortcode:` の文字のまま見える
 */
export const withReferences = (
  draft: EventDraft,
  options: { emoji?: EmojiLookup },
): EventDraft => {
  const tags = [...draft.tags];
  const tagged = (name: string, value: string) =>
    tags.some((tag) => tag[0] === name && tag[1] === value);

  for (const person of mentionedPeople(draft.content)) {
    if (tagged("p", person.pubkey)) continue;
    tags.push(
      person.relay ? ["p", person.pubkey, person.relay] : ["p", person.pubkey],
    );
  }
  if (options.emoji) {
    for (const shortcode of shortcodesIn([draft.content])) {
      if (tagged("emoji", shortcode)) continue;
      const url = options.emoji(shortcode);
      if (url !== undefined) tags.push(["emoji", shortcode, url]);
    }
  }
  return { ...draft, tags };
};

/**
 * プロフィール（kind:0）の `emoji` タグを、中身で使っている分だけにする。
 *
 * - 前から持っていたタグは、まだ使っていれば残す（別のクライアントで付けた
 *   もので、自分の絵文字に無くても消さない）
 * - 新しく使ったものは自分の絵文字から足す
 * - 使わなくなったものは外す。`emoji` 以外のタグには触らない
 *
 * どの項目で使っていてもよいように、中身の文字列の値をすべて見る。
 */
export const profileEmojiTags = (
  tags: readonly string[][],
  profile: Record<string, unknown>,
  emoji: EmojiLookup | undefined,
): string[][] => {
  const texts = Object.values(profile).filter(
    (value): value is string => typeof value === "string",
  );
  const used = shortcodesIn(texts);
  const kept = new Map<string, string[]>();
  for (const tag of tags) {
    const shortcode = tag[1];
    if (tag[0] !== "emoji" || shortcode === undefined) continue;
    if (used.includes(shortcode) && !kept.has(shortcode)) {
      kept.set(shortcode, tag);
    }
  }
  const emojiTags: string[][] = [];
  for (const shortcode of used) {
    const existing = kept.get(shortcode);
    if (existing) {
      emojiTags.push(existing);
      continue;
    }
    const url = emoji?.(shortcode);
    if (url !== undefined) emojiTags.push(["emoji", shortcode, url]);
  }
  return [...tags.filter((tag) => tag[0] !== "emoji"), ...emojiTags];
};
