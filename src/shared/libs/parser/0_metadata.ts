import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";

const fallbackUnknown = <TIn, TOut, TIssue>(
  s: v.BaseSchema<TIn, TOut, v.BaseIssue<TIssue>>,
) =>
  v.union([
    s,
    v.pipe(
      v.unknown(),
      v.transform(() => undefined),
    ),
  ]);

// TODO: NIP-57

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds
const NIP01 = v.object({
  name: v.nullish(v.string(), ""),
  about: v.nullish(v.string(), ""),
  picture: v.nullish(v.string(), () => undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/05.md
const NIP05 = v.object({
  nip05: v.nullish(fallbackUnknown(v.string()), () => undefined),
});

const strBoolean = v.pipe(
  v.union([v.literal("true"), v.literal("false")]),
  v.transform((input) => input === "true"),
);

// https://github.com/nostr-protocol/nips/blob/master/24.md#kind-0
const NIP24 = v.object({
  display_name: v.nullish(v.string(), () => undefined),
  website: v.nullish(v.string(), () => undefined),
  banner: v.nullish(v.string(), () => undefined),
  bot: v.nullish(v.union([v.boolean(), strBoolean]), () => undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/24.md#deprecated-fields
const NIP24Deprecated = v.object({
  displayName: v.nullish(v.string(), () => undefined),
  username: v.nullish(v.string(), () => undefined),
});

const metadataContentSchema = v.pipe(
  v.object({
    ...NIP01.entries,
    ...NIP05.entries,
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
