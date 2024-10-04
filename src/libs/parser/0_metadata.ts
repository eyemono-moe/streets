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
  display_name: v.nullish(v.string(), undefined),
  website: v.nullish(v.string(), undefined),
  banner: v.nullish(v.string(), undefined),
  bot: v.nullish(v.boolean(), undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/24.md#deprecated-fields
const NIP24Deprecated = v.object({
  displayName: v.nullish(v.string(), undefined),
  username: v.nullish(v.string(), undefined),
});

const metadataContentSchema = v.pipe(
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

export const parseMetadata = (input: NostrEvent) => {
  if (input.kind !== kinds.Metadata) {
    throw new Error(`kind is not Metadata: ${input.kind}`);
  }
  let content: string;
  try {
    content = JSON.parse(input.content);
  } catch (e) {
    throw new Error(`failed to parse profile: ${e}`);
  }

  const res = v.safeParse(metadataContentSchema, content);
  if (res.success) {
    return { ...res.output, kind: input.kind, pubkey: input.pubkey } as const;
  }
  throw new Error(
    `failed to parse profile: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type Metadata = ReturnType<typeof parseMetadata>;
