import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { type AddressTag, addressTag, emojiTag, unknownTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/51.md#standard-lists

const emojiListTag = v.pipe(
  v.array(
    v.union([
      emojiTag,
      addressTag,
      // fallback
      unknownTag,
    ]),
  ),
  v.transform((input) => {
    const emojis = input.filter((tag) => tag.kind === "emoji");

    const emojiSets = input
      .filter((tag): tag is AddressTag => tag.kind === "a")
      .map((tag) => ({
        pubkey: tag.data.pubkey,
        tag: tag.data.tag,
      }));

    return {
      emojis,
      emojiSets,
    };
  }),
);

export const parseEmojiList = (input: NostrEvent) => {
  if (input.kind !== kinds.UserEmojiList) {
    throw new Error(`kind is not UserEmojiList: ${input.kind}`);
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
    `failed to parse emoji list: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type EmojiList = ReturnType<typeof parseEmojiList>;
