import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import {
  type EventTag,
  emojiTag,
  eventTag,
  hashtagTag,
  imetaTag,
  quoteTag,
  unknownTag,
  userTag,
} from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds

const textNoteTags = v.pipe(
  v.array(
    v.union([
      userTag,
      eventTag,
      quoteTag,
      imetaTag,
      emojiTag,
      hashtagTag,
      // fallback
      unknownTag,
    ]),
  ),
  v.transform((input) => {
    const eTags = input.filter((tag) => tag.kind === "e");
    const otherTags = input.filter((tag) => tag.kind !== "e");

    if (eTags.length === 0) {
      return otherTags;
    }

    // positional e tags (deprecated)の対応
    // 一つでもmarkerを持っていれば marked e tagsが用いられていると判定
    if (eTags.some((tag) => tag.marker !== undefined)) {
      return [...otherTags, ...eTags];
    }

    // positional e tagsの場合
    // 長さが1の場合はそれをreplyとする
    if (eTags.length === 1) {
      return [
        ...otherTags,
        {
          ...eTags[0],
          marker: "reply",
        } satisfies EventTag,
      ];
    }
    // 長さが2以上の場合は、最初のものをroot、最後のものをreply、それ以外をmentionとする
    return [
      ...otherTags,
      {
        ...eTags[0],
        marker: "root",
      } satisfies EventTag,
      ...eTags.slice(1, -1).map((tag) => ({
        ...tag,
        marker: "mention",
      })),
      {
        ...eTags[eTags.length - 1],
        marker: "reply",
      } satisfies EventTag,
    ];
  }),
);

export const parseTextNoteTags = (input: string[][]) => {
  const res = v.safeParse(textNoteTags, input);
  if (res.success) {
    return res.output;
  }
  throw new Error(
    `failed to parse text note tags: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export const parseShortTextNote = (input: NostrEvent) => {
  if (input.kind !== kinds.ShortTextNote) {
    throw new Error(`kind is not ShortTextNote: ${input.kind}`);
  }

  const tagsRes = v.safeParse(textNoteTags, input.tags);
  if (tagsRes.success) {
    return {
      id: input.id,
      kind: input.kind,
      content: input.content,
      pubkey: input.pubkey,
      tags: tagsRes.output,
    } as const;
  }
  throw new Error(
    `failed to parse short text note: ${JSON.stringify(tagsRes.issues, null, 2)}`,
  );
};

export type ShortTextNote = ReturnType<typeof parseShortTextNote>;
