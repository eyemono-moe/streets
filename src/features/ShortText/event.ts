import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { eventTag, quoteTag, userTag } from "../../libs/commonTag";

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds

const textNoteTags = v.array(
  v.union([
    userTag,
    eventTag,
    quoteTag,
    // fallback
    v.pipe(
      v.array(v.string()),
      v.transform((input) => ({ kind: "unknown", data: input }) as const),
    ),
  ]),
);

export const parseShortTextNote = (input: NostrEvent) => {
  if (input.kind !== kinds.ShortTextNote) {
    throw new Error("kind is not ShortTextNote");
  }

  const tagsRes = v.safeParse(textNoteTags, input.tags);
  return {
    kind: "ShortTextNote",
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
    kind: "Repost",
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
