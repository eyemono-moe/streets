import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { type ShortTextNote, parseShortTextNote } from "./1_shortTextNote";
import { eventTag, unknownTag, userTag } from "./commonTag";

const repostTags = v.array(
  v.union([
    userTag,
    eventTag,
    // fallback
    unknownTag,
  ]),
);

export const parseRepost = (input: NostrEvent) => {
  if (input.kind !== kinds.Repost) {
    throw new Error(`kind is not Repost: ${input.kind}`);
  }

  let parsedContent: ShortTextNote | undefined;
  try {
    parsedContent = parseShortTextNote(JSON.parse(input.content));
  } catch (e) {
    console.warn(`failed to parse repost content: ${e}`);
  }

  const tagsRes = v.safeParse(repostTags, input.tags);
  if (tagsRes.success) {
    return {
      kind: input.kind,
      rawContent: input.content,
      pubkey: input.pubkey,
      parsedContent,
      tags: tagsRes.output,
    } as const;
  }
  throw new Error(
    `failed to parse repost: ${JSON.stringify(tagsRes.issues, null, 2)}`,
  );
};

export type Repost = ReturnType<typeof parseRepost>;
