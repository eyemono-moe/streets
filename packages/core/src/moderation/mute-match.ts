import { type NostrEvent, isNostrEvent } from "../nostr/event";
import {
  embeddedRepostEvent,
  replyTarget,
  repostTarget,
  threadRoot,
} from "../nostr/event-refs";
import { parseReaction } from "../nostr/reaction";
import type { MuteEntry } from "./mute-list";

/** イベントがミュートに当たるか。 */
export type MuteMatcher = (event: NostrEvent) => boolean;

type MuteIndex = {
  pubkeys: ReadonlySet<string>;
  threads: ReadonlySet<string>;
  hashtags: ReadonlySet<string>;
  words: readonly string[];
};

const indexOf = (entries: readonly MuteEntry[]): MuteIndex => {
  const pubkeys = new Set<string>();
  const threads = new Set<string>();
  const hashtags = new Set<string>();
  const words: string[] = [];
  for (const { target } of entries) {
    switch (target.type) {
      case "pubkey":
        pubkeys.add(target.value);
        break;
      case "thread":
        threads.add(target.value);
        break;
      case "hashtag":
        hashtags.add(target.value);
        break;
      case "word":
        words.push(target.value.toLowerCase());
        break;
    }
  }
  return { pubkeys, threads, hashtags, words };
};

const inThread = (index: MuteIndex, id: string | undefined) =>
  id !== undefined && index.threads.has(id);

/** 投稿そのもの（著者・スレッド・タグ・本文）を見る。 */
const matchesNote = (
  index: MuteIndex,
  event: NostrEvent,
  { words }: { words: boolean },
): boolean => {
  if (index.pubkeys.has(event.pubkey)) return true;
  if (
    index.threads.size > 0 &&
    (inThread(index, event.id) ||
      inThread(index, threadRoot(event)?.id) ||
      inThread(index, replyTarget(event)?.id))
  ) {
    return true;
  }
  if (
    index.hashtags.size > 0 &&
    event.tags.some((tag) => tag[0] === "t" && index.hashtags.has(tag[1] ?? ""))
  ) {
    return true;
  }
  if (!words || index.words.length === 0) return false;
  const content = event.content.toLowerCase();
  return index.words.some((word) => content.includes(word));
};

/**
 * 受領の中の依頼（送った人が書いたもの）。判定に使うだけなので署名は確かめない ——
 * 偽の依頼で起きるのは、その Zap が隠れることだけ。
 */
const zapRequestOf = (receipt: NostrEvent): NostrEvent | undefined => {
  const description = receipt.tags.find((tag) => tag[0] === "description")?.[1];
  if (!description) return undefined;
  try {
    const json: unknown = JSON.parse(description);
    return isNostrEvent(json) && json.kind === 9734 ? json : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 手元のイベントだけで判定する。リポストの元投稿やリアクションの相手を取りにいかない
 * のは、届いてから行が消えると読んでいる一覧が動くため。分かるのはタグと、
 * リポストに埋め込まれた元投稿まで。
 */
const matches = (index: MuteIndex, event: NostrEvent): boolean => {
  switch (event.kind) {
    case 6:
    case 16: {
      // 本文は元投稿の JSON なので、語はリポストの本文ではなく元投稿に当てる。
      if (matchesNote(index, event, { words: false })) return true;
      const pubkey = event.tags.find((tag) => tag[0] === "p")?.[1];
      if (pubkey !== undefined && index.pubkeys.has(pubkey)) return true;
      if (inThread(index, repostTarget(event)?.id)) return true;
      const original = embeddedRepostEvent(event);
      return (
        original !== undefined && matchesNote(index, original, { words: true })
      );
    }
    case 7: {
      if (matchesNote(index, event, { words: true })) return true;
      const reaction = parseReaction(event);
      return (
        reaction !== undefined &&
        ((reaction.targetPubkey !== undefined &&
          index.pubkeys.has(reaction.targetPubkey)) ||
          inThread(index, reaction.targetId))
      );
    }
    case 9735: {
      // 受領の作者はウォレットのサーバー。送った人と一言は依頼の側にある。
      const request = zapRequestOf(event);
      if (request && matchesNote(index, request, { words: true })) return true;
      return inThread(index, event.tags.find((tag) => tag[0] === "e")?.[1]);
    }
    default:
      return matchesNote(index, event, { words: true });
  }
};

/**
 * ミュートの一覧から判定を作る。一覧が変わったら作り直す。結果はイベントごとに
 * 覚えるので、一覧を描き直すたびに JSON を読み直さない。自分のイベントは当てない。
 */
export const createMuteMatcher = (
  entries: readonly MuteEntry[],
  viewer?: string,
): MuteMatcher => {
  if (entries.length === 0) return () => false;
  const index = indexOf(entries);
  const cache = new WeakMap<NostrEvent, boolean>();
  return (event) => {
    if (event.pubkey === viewer) return false;
    const known = cache.get(event);
    if (known !== undefined) return known;
    const result = matches(index, event);
    cache.set(event, result);
    return result;
  };
};
