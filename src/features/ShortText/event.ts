import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds

// TODO: tags

export const parseShortTextNote = (input: NostrEvent) => {
  if (input.kind !== kinds.ShortTextNote) {
    throw new Error("kind is not ShortTextNote");
  }
  return {
    content: input.content,
    id: input.id,
    created_at: input.created_at,
    pubkey: input.pubkey,
  };
};

// https://github.com/nostr-protocol/nips/blob/master/02.md
const followListTags = v.array(
  v.tuple([
    v.literal("p"),
    v.string(), // user pubkey
    v.optional(v.string()), // main relay url
    v.optional(v.string()), // petname
  ]),
);

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
