import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { emojiTag, identifierTag, unknownTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/51.md#sets

const emojiListTag = v.pipe(
  v.array(
    v.union([
      emojiTag,
      identifierTag,
      // fallback
      unknownTag,
    ]),
  ),
  v.transform((input) => {
    const d = input.find((tag) => tag.kind === "d");

    if (!d) {
      throw new Error(`missing identifier tag: ${JSON.stringify(input)}`);
    }

    const emojis = input.filter((tag) => tag.kind === "emoji");

    return {
      identifier: d.identifier,
      emojis,
    };
  }),
);

export const parseEmojiSet = (input: NostrEvent) => {
  if (input.kind !== kinds.Emojisets) {
    throw new Error(`kind is not Emojisets: ${input.kind}`);
  }
  const res = v.safeParse(emojiListTag, input.tags);
  if (res.success) {
    return {
      kind: input.kind,
      pubkey: input.pubkey,
      ...res.output,
    } as const;
  }
  throw new Error(
    `failed to parse emoji set: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type EmojiSet = ReturnType<typeof parseEmojiSet>;
