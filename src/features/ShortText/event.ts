import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { eventTag, userTag } from "../../libs/commonTag";

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds

const tags = v.array(
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

export const parseShortTextNote = (input: NostrEvent) => {
  if (input.kind !== kinds.ShortTextNote) {
    throw new Error("kind is not ShortTextNote");
  }

  const tagsRes = v.safeParse(tags, input.tags);
  return {
    content: input.content,
    id: input.id,
    created_at: input.created_at,
    pubkey: input.pubkey,
    tags: tagsRes.success ? tagsRes.output : [],
  };
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
    };
  }
  throw new Error(`failed to parse short text note: ${res.issues}`);
};
