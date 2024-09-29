import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import {
  type EventTag,
  emojiTag,
  eventTag,
  imetaTag,
  quoteTag,
  userTag,
} from "../../libs/commonTag";

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds

const textNoteTags = v.pipe(
  v.array(
    v.union([
      userTag,
      eventTag,
      quoteTag,
      imetaTag,
      emojiTag,
      // fallback
      v.pipe(
        v.array(v.string()),
        v.transform((input) => ({ kind: "unknown", data: input }) as const),
      ),
    ]),
  ),
  v.transform((input) => {
    const eTags = input.filter((tag) => tag.kind === "e");
    const otherTags = input.filter((tag) => tag.kind !== "e");

    if (eTags.length === 0) {
      return otherTags;
    }

    // positional e tags (deprecated)の対応
    // 一つでもmarkerを持っていれば marked e tagsが用いられていると判定
    const isMarkedETags = eTags.some((tag) => tag.marker !== undefined);

    if (isMarkedETags) {
      return [...otherTags, ...eTags];
    }

    // positional e tagsの場合
    // 長さが1の場合はそれをreplyとする
    if (eTags.length === 1) {
      return [
        ...otherTags,
        {
          ...eTags[0],
          marker: "reply",
        } satisfies EventTag,
      ];
    }
    // 長さが2以上の場合は、最初のものをroot、最後のものをreply、それ以外をmentionとする
    return [
      ...otherTags,
      {
        ...eTags[0],
        marker: "root",
      } satisfies EventTag,
      ...eTags.slice(1, -1).map((tag) => ({
        ...tag,
        marker: "mention",
      })),
      {
        ...eTags[eTags.length - 1],
        marker: "reply",
      } satisfies EventTag,
    ];
  }),
);

export const parseShortTextNote = (input: NostrEvent) => {
  if (input.kind !== kinds.ShortTextNote) {
    throw new Error("kind is not ShortTextNote");
  }

  const tagsRes = v.safeParse(textNoteTags, input.tags);
  return {
    kind: input.kind,
    content: input.content,
    id: input.id,
    created_at: input.created_at,
    pubkey: input.pubkey,
    tags: tagsRes.success ? tagsRes.output : [],
    raw: input,
  } as const;
};

const repostTags = v.array(
  v.union([
    userTag,
    eventTag,
    // fallback
    v.pipe(
      v.array(v.string()),
      v.transform((input) => ({ kind: "unknown", data: input }) as const),
    ),
  ]),
);

export const parseRepost = (input: NostrEvent) => {
  if (input.kind !== kinds.Repost) {
    throw new Error("kind is not Repost");
  }

  const tagsRes = v.safeParse(repostTags, input.tags);
  return {
    kind: input.kind,
    content: input.content,
    id: input.id,
    created_at: input.created_at,
    pubkey: input.pubkey,
    tags: tagsRes.success ? tagsRes.output : [],
    raw: input,
  } as const;
};

export const parseTextNoteOrRepost = (input: NostrEvent) => {
  if (input.kind === kinds.ShortTextNote) {
    return parseShortTextNote(input);
  }
  if (input.kind === kinds.Repost) {
    return parseRepost(input);
  }
  throw new Error("kind is not ShortTextNote or Repost");
};

// https://github.com/nostr-protocol/nips/blob/master/02.md
const followListTags = v.array(userTag);

export const parseFollowList = (input: NostrEvent) => {
  if (input.kind !== kinds.Contacts) {
    throw new Error("kind is not FollowList");
  }
  const res = v.safeParse(followListTags, input.tags);
  if (res.success) {
    return {
      tags: res.output,
      id: input.id,
      created_at: input.created_at,
      raw: input,
    };
  }
  throw new Error(`failed to parse short text note: ${res.issues}`);
};

// https://github.com/nostr-protocol/nips/blob/master/25.md

const reactionTags = v.pipe(
  v.array(v.union([userTag, eventTag, emojiTag])),
  v.transform((input) => {
    const pubkeys = input.filter((tag) => tag.kind === "p");
    const events = input.filter((tag) => tag.kind === "e");
    const emoji = input.find((tag) => tag.kind === "emoji"); // emoji tag should be one

    return {
      pubkeys,
      events,
      emoji,
    };
  }),
);

export const parseReaction = (input: NostrEvent) => {
  if (input.kind !== kinds.Reaction) {
    throw new Error("kind is not Reaction");
  }
  const res = v.safeParse(reactionTags, input.tags);
  if (res.success) {
    return {
      targetPubkeys: res.output.pubkeys,
      targetEvents: res.output.events,
      emoji: res.output.emoji,
      // If the content is an empty string then the client should consider it a "+"
      content: input.content || "+",
      pubkey: input.pubkey,
      id: input.id,
      created_at: input.created_at,
      raw: input,
    };
  }
  throw new Error(`failed to parse short text note: ${res.issues}`);
};
