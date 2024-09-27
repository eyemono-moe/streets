import * as v from "valibot";

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
