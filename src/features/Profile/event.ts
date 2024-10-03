import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";

// TODO: NIP-05,NIP-57

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds
const NIP01 = v.object({
  name: v.nullish(v.string(), ""),
  about: v.nullish(v.string(), ""),
  picture: v.nullish(v.string(), undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/24.md#kind-0
const NIP24 = v.object({
  display_name: v.nullish(v.string()),
  website: v.nullish(v.string()),
  banner: v.nullish(v.string(), undefined),
  bot: v.nullish(v.boolean()),
});

// https://github.com/nostr-protocol/nips/blob/master/24.md#deprecated-fields
const NIP24Deprecated = v.object({
  displayName: v.nullish(v.string()),
  username: v.nullish(v.string()),
});

const profileContentSchema = v.pipe(
  v.object({
    ...NIP01.entries,
    ...NIP24.entries,
    ...NIP24Deprecated.entries,
  }),
  v.transform((output) => ({
    ...output,
    display_name: output.display_name ?? output.displayName,
    /** @deprecated use display_name */
    displayName: output.displayName,
    /** @deprecated use name */
    username: output.username,
  })),
);

export const parseProfile = (input: NostrEvent) => {
  if (input.kind !== kinds.Metadata) {
    throw new Error("kind is not Metadata");
  }
  const content = JSON.parse(input.content);
  const res = v.safeParse(profileContentSchema, content);
  if (res.success) {
    return {
      ...res.output,
      kind: input.kind,
      pubkey: input.pubkey,
      id: input.id,
      created_at: input.created_at,
      raw: input,
    } as const;
  }
  throw new Error(
    `failed to parse profile: ${JSON.stringify(res.issues, null, 2)}`,
  );
};
