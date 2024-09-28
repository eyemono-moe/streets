import * as v from "valibot";

// https://github.com/nostr-protocol/nips?tab=readme-ov-file#standardized-tags

// https://github.com/nostr-protocol/nips/blob/master/01.md#tags
// https://github.com/nostr-protocol/nips/blob/master/10.md#marked-e-tags-preferred
export const eventTag = v.pipe(
  v.tuple([
    v.literal("e"),
    v.string(), // event id
    v.optional(v.string()), // recommended relay url
    v.optional(
      v.union([v.literal("reply"), v.literal("root"), v.literal("mention")]),
    ), // marker
    v.optional(v.string()), // pubkey
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        id: input[1],
        relay: input[2],
        marker: input[3],
        pubkey: input[4],
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
  v.transform((input) => {
    const [kind, ...rest] = input;
    const kv = Object.fromEntries(rest.map((i) => [i.key, i.value]));
    return {
      kind,
      ...kv,
    };
  }),
);

export type ImetaTag = v.InferOutput<typeof imetaTag>;
