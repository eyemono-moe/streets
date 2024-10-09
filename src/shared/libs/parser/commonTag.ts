import * as v from "valibot";

// https://github.com/nostr-protocol/nips?tab=readme-ov-file#standardized-tags

export const unknownTag = v.pipe(
  v.array(v.string()),
  v.transform((input) => ({ kind: "unknown", data: input }) as const),
);

export type UnknownTag = v.InferOutput<typeof unknownTag>;

// https://github.com/nostr-protocol/nips/blob/master/01.md#tags
// https://github.com/nostr-protocol/nips/blob/master/10.md#marked-e-tags-preferred
export const eventTag = v.pipe(
  v.tuple([
    v.literal("e"),
    v.string(), // event id
    v.optional(v.string()), // recommended relay url
    v.optional(
      v.union([
        // marker
        v.pipe(
          v.union([
            v.literal("reply"),
            v.literal("root"),
            v.literal("mention"),
          ]),
          v.transform((i) => ({ type: "marker", value: i })),
        ),
        // pubkey (voyageのrepostイベントではここにpubkeyが入る)
        v.pipe(
          v.string(),
          v.transform((i) => ({ type: "pubkey", value: i })),
        ),
      ]),
    ),
    v.optional(v.string()), // pubkey
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        id: input[1],
        relay: input[2],
        marker: input[3]?.type === "marker" ? input[3].value : undefined,
        pubkey:
          (input[4] ?? input[3]?.type === "pubkey")
            ? input[3]?.value
            : undefined,
      }) as const,
  ),
);

export type EventTag = v.InferOutput<typeof eventTag>;

export const userTag = v.pipe(
  v.tuple([
    v.literal("p"),
    v.string(), // user pubkey
    v.optional(v.string()), // recommended relay url
    v.optional(v.string()), // petname
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        pubkey: input[1],
        relay: input[2],
        petname: input[3],
      }) as const,
  ),
);

export type UserTag = v.InferOutput<typeof userTag>;

// https://github.com/nostr-protocol/nips/blob/master/18.md#nip-18
export const quoteTag = v.pipe(
  v.tuple([
    v.literal("q"),
    v.string(), // event id
    v.optional(v.string()), // recommended relay url
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        id: input[1],
        relay: input[2],
      }) as const,
  ),
);

export type QuoteTag = v.InferOutput<typeof quoteTag>;

// https://github.com/nostr-protocol/nips/blob/master/92.md
export const imetaTag = v.pipe(
  v.tupleWithRest(
    [v.literal("imeta")],
    v.pipe(
      v.string(),
      v.transform((input) => {
        const [key, value] = input.split(/\s(.*)/s);
        return { key, value };
      }),
    ),
  ),
  v.transform(
    (
      input,
    ): {
      kind: "imeta";
      [key: string]: string;
    } => {
      const [kind, ...rest] = input;
      const kv = Object.fromEntries(rest.map((i) => [i.key, i.value]));
      return {
        kind,
        ...kv,
      };
    },
  ),
);

export type ImetaTag = v.InferOutput<typeof imetaTag>;

// https://github.com/nostr-protocol/nips/blob/master/30.md
export const emojiTag = v.pipe(
  v.tuple([
    v.literal("emoji"),
    v.string(), // short code
    v.string(), // image url
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        name: input[1],
        url: input[2],
      }) as const,
  ),
);

export type EmojiTag = v.InferOutput<typeof emojiTag>;

// https://github.com/nostr-protocol/nips/blob/master/24.md#tags
export const hashtagTag = v.pipe(
  v.tuple([
    v.literal("t"),
    v.string(), // hashtag
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        tag: input[1],
      }) as const,
  ),
);

export type HashtagTag = v.InferOutput<typeof hashtagTag>;

// https://github.com/nostr-protocol/nips/blob/master/01.md#tags
export const addressTag = v.pipe(
  v.tuple([
    v.literal("a"),
    v.string(), // kind:pubkey:d tag
    v.optional(v.string()), // relay url
  ]),
  v.transform((input) => {
    const [kind, pubkey, tag] = input[1].split(":");

    return {
      kind: input[0],
      data: {
        kind: Number(kind),
        pubkey,
        tag,
      },
      relay: input[2],
    } as const;
  }),
);

export type AddressTag = v.InferOutput<typeof addressTag>;

// https://github.com/nostr-protocol/nips/blob/master/01.md#tags
export const identifierTag = v.pipe(
  v.tuple([
    v.literal("d"),
    v.string(), // identifier
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        identifier: input[1],
      }) as const,
  ),
);

export type IdentifierTag = v.InferOutput<typeof identifierTag>;

export type Tag =
  | UnknownTag
  | EventTag
  | UserTag
  | QuoteTag
  | ImetaTag
  | EmojiTag
  | HashtagTag
  | AddressTag
  | IdentifierTag;
