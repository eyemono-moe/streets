import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { userTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/02.md
const followListTags = v.array(userTag);

export const parseContacts = (input: NostrEvent) => {
  if (input.kind !== kinds.Contacts) {
    throw new Error(`kind is not Contacts: ${input.kind}`);
  }
  const res = v.safeParse(followListTags, input.tags);
  if (res.success) {
    return {
      kind: input.kind,
      pubkey: input.pubkey,
      followees: res.output,
    } as const;
  }
  throw new Error(
    `failed to parse contacts: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type FollowList = ReturnType<typeof parseContacts>;
