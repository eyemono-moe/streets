import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { EventDraft } from "../core/nostr/build/draft";
import { buildQuote, buildReply } from "../core/nostr/build/note";
import {
  type ReactionInput,
  buildReaction,
} from "../core/nostr/build/reaction";
import { buildRepost } from "../core/nostr/build/repost";
import {
  type NostrEvent,
  type UnsignedEvent,
  computeEventId,
} from "../core/nostr/event";

export type StoryProfile = {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
};

export type StoryAuthor = {
  readonly pubkey: string;
  profile(overrides?: StoryProfile): NostrEvent;
  event(draft: EventDraft, options?: { createdAt?: number }): NostrEvent;
  note(
    content: string,
    options?: { tags?: string[][]; createdAt?: number },
  ): NostrEvent;
  reply(
    content: string,
    options: { parent: NostrEvent; createdAt?: number },
  ): NostrEvent;
  quote(
    content: string,
    options: { target: NostrEvent; createdAt?: number },
  ): NostrEvent;
  repost(target: NostrEvent, options?: { createdAt?: number }): NostrEvent;
  reaction(
    target: NostrEvent,
    input: ReactionInput,
    options?: { createdAt?: number },
  ): NostrEvent;
  unknown(
    kind: number,
    content: string,
    options?: { tags?: string[][]; createdAt?: number },
  ): NostrEvent;
};

const keyFor = (seed: number): Uint8Array => {
  if (!Number.isInteger(seed) || seed < 1 || seed > 254) {
    throw new Error("Story の著者 seed は 1〜254 の整数にしてください");
  }
  return Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => ((seed + index * 7) % 255) + 1),
  );
};

const sign = (privateKey: Uint8Array, unsigned: UnsignedEvent): NostrEvent => {
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    // BIP-340 の auxRand は安全性の補助であり署名の有効性には影響しない。
    // Story は秘密鍵を製品用途に使わず、リロードごとに DOM が変わらない
    // ことを優先するため固定値にする。
    sig: bytesToHex(
      schnorr.sign(hexToBytes(id), privateKey, new Uint8Array(32)),
    ),
  };
};

/**
 * Story の表示データだけを組み立てる著者。固定 seed から有効な NostrEvent を
 * 作るため、Story 側は秘密鍵・event id・sig を手で用意しなくてよい。
 */
export const createStoryAuthor = (
  seed: number,
  initialProfile: StoryProfile = {},
): StoryAuthor => {
  const privateKey = keyFor(seed);
  const pubkey = bytesToHex(schnorr.getPublicKey(privateKey));
  const baseCreatedAt = 1_720_000_000 + seed * 1_000;
  let sequence = 0;

  const event = (
    draft: EventDraft,
    options: { createdAt?: number } = {},
  ): NostrEvent =>
    sign(privateKey, {
      pubkey,
      created_at: options.createdAt ?? baseCreatedAt + sequence++,
      ...draft,
    });

  return {
    pubkey,
    event,
    profile(overrides = {}) {
      const profile = { ...initialProfile, ...overrides };
      return event({
        kind: 0,
        tags: [],
        content: JSON.stringify({
          name: profile.name,
          display_name: profile.displayName,
          about: profile.about,
          picture: profile.picture,
        }),
      });
    },
    note(content, options = {}) {
      return event(
        { kind: 1, tags: options.tags ?? [], content },
        { createdAt: options.createdAt },
      );
    },
    reply(content, options) {
      return event(buildReply(options.parent, content), {
        createdAt: options.createdAt,
      });
    },
    quote(content, options) {
      return event(buildQuote(options.target, content), {
        createdAt: options.createdAt,
      });
    },
    repost(target, options = {}) {
      const draft = buildRepost(target);
      if (!draft) throw new Error("kind:1 以外は kind:6 でリポストできません");
      return event(draft, { createdAt: options.createdAt });
    },
    reaction(target, input, options = {}) {
      return event(buildReaction(target, input), {
        createdAt: options.createdAt,
      });
    },
    unknown(kind, content, options = {}) {
      return event(
        { kind, tags: options.tags ?? [], content },
        { createdAt: options.createdAt },
      );
    },
  };
};
