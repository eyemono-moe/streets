import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { emojiTag, eventTag, unknownTag, userTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/25.md

const reactionTags = v.pipe(
  v.array(
    v.union([
      userTag,
      eventTag,
      emojiTag,
      // fallback
      unknownTag,
    ]),
  ),
  v.transform((input) => {
    // https://github.com/nostr-protocol/nips/blob/master/25.md#tags
    const allPubkeys = input.filter((tag) => tag.kind === "p");
    const relatedPubkeys = allPubkeys.slice(0, -1);
    // biome-ignore lint/style/noNonNullAssertion: The last p tag MUST be the pubkey of the event being reacted to.
    const targetEventPubkey = allPubkeys.at(-1)!;

    const allEvents = input.filter((tag) => tag.kind === "e");
    const relatedEvents = allEvents.slice(0, -1);
    // biome-ignore lint/style/noNonNullAssertion: The last e tag MUST be the id of the note that is being reacted to.
    const targetEvent = allEvents.at(-1)!;

    const emoji = input.find((tag) => tag.kind === "emoji"); // emoji tag should be one

    return {
      targetEventPubkey,
      relatedPubkeys,
      targetEvent,
      relatedEvents,
      emoji,
    };
  }),
);

export const parseReaction = (input: NostrEvent) => {
  if (input.kind !== kinds.Reaction) {
    throw new Error(`kind is not Reaction: ${input.kind}`);
  }
  const res = v.safeParse(reactionTags, input.tags);
  if (res.success) {
    return {
      kind: input.kind,
      // If the content is an empty string then the client should consider it a "+".
      content: input.content || "+",
      pubkey: input.pubkey,
      ...res.output,
    } as const;
  }
  throw new Error(
    `failed to parse reaction: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type Reaction = ReturnType<typeof parseReaction>;
