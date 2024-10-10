import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { unknownTag, userTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/02.md
const followListTags = v.array(v.union([userTag, unknownTag]));

export const parseContacts = (input: NostrEvent) => {
  if (input.kind !== kinds.Contacts) {
    throw new Error(`kind is not Contacts: ${input.kind}`);
  }
  const res = v.safeParse(followListTags, input.tags);
  if (res.success) {
    return {
      kind: input.kind,
      content: input.content,
      pubkey: input.pubkey,
      followees: res.output.filter((tag) => tag.kind === "p"),
    } as const;
  }
  throw new Error(
    `failed to parse contacts: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type FollowList = ReturnType<typeof parseContacts>;
