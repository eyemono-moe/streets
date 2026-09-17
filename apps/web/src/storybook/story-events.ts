import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { EventDraft } from "@streets/core/nostr/build/draft";
import { buildQuote, buildReply } from "@streets/core/nostr/build/note";
import { buildRepost } from "@streets/core/nostr/build/repost";
import { type NostrEvent, computeEventId } from "@streets/core/nostr/event";

export type StoryProfile = {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  banner?: string;
};

const keyFor = (seed: number): Uint8Array =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => ((seed + index * 7) % 255) + 1),
  );

/**
 * 固定 seed から署名済みのイベントを作る著者。
 * 本番と同じ検証を通すので、ストーリーが秘密鍵や id を手で持たなくてよい。
 */
export const createStoryAuthor = (seed: number, profile: StoryProfile = {}) => {
  const privateKey = keyFor(seed);
  const pubkey = bytesToHex(schnorr.getPublicKey(privateKey));
  // 時刻の表示を実行日に左右させないよう、過去の固定日時から数える。
  let createdAt = 1_720_000_000 + seed * 1_000;

  const event = (draft: EventDraft): NostrEvent => {
    const unsigned = { pubkey, created_at: createdAt++, ...draft };
    const id = computeEventId(unsigned);
    return {
      ...unsigned,
      id,
      // auxRand を固定し、再読み込みで sig が変わらないようにする。
      sig: bytesToHex(
        schnorr.sign(hexToBytes(id), privateKey, new Uint8Array(32)),
      ),
    };
  };

  return {
    pubkey,
    event,
    profile: () =>
      event({
        kind: 0,
        tags: [],
        content: JSON.stringify({
          name: profile.name,
          display_name: profile.displayName,
          picture: profile.picture,
          about: profile.about,
          banner: profile.banner,
        }),
      }),
    follows: (pubkeys: readonly string[]) =>
      event({
        kind: 3,
        tags: pubkeys.map((pubkey) => ["p", pubkey]),
        content: "",
      }),
    note: (content: string, tags: string[][] = []) =>
      event({ kind: 1, tags, content }),
    reply: (parent: NostrEvent, content: string) =>
      event(buildReply(parent, content)),
    quote: (target: NostrEvent, content: string) =>
      event(buildQuote(target, content)),
    repost: (target: NostrEvent) => {
      const draft = buildRepost(target);
      if (!draft) throw new Error("kind:1 以外は kind:6 でリポストできません");
      return event(draft);
    },
  };
};

export type StoryAuthor = ReturnType<typeof createStoryAuthor>;
