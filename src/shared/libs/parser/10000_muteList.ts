import { type NostrEvent, kinds } from "nostr-tools";
import * as v from "valibot";
import { useNIP07 } from "../useNIP07";
import { eventTag, hashtagTag, unknownTag, userTag } from "./commonTag";

// https://github.com/nostr-protocol/nips/blob/master/51.md#standard-lists

const wordTag = v.pipe(
  v.tuple([
    v.literal("word"),
    v.string(), // word
  ]),
  v.transform(
    (input) =>
      ({
        kind: input[0],
        word: input[1],
      }) as const,
  ),
);

const muteListTag = v.pipe(
  v.array(
    v.union([
      eventTag,
      userTag,
      hashtagTag,
      wordTag,
      // fallback
      unknownTag,
    ]),
  ),
  v.transform((input) => {
    return input.reduce<{
      events: string[];
      users: string[];
      hashtags: string[];
      words: string[];
    }>(
      (acc, tag) => {
        switch (tag.kind) {
          case "e":
            acc.events.push(tag.id);
            break;
          case "p":
            acc.users.push(tag.pubkey);
            break;
          case "t":
            acc.hashtags.push(tag.tag);
            break;
          case "word":
            acc.words.push(tag.word);
            break;
          default:
            break;
        }
        return acc;
      },
      {
        events: [],
        users: [],
        hashtags: [],
        words: [],
      },
    );
  }),
);

export const decryptMuteListContent = async (
  content: string,
  myPubkey: string,
) => {
  const privateItemsRaw = await useNIP07().nip04?.decrypt(myPubkey, content);
  if (privateItemsRaw) {
    const res = v.safeParse(muteListTag, JSON.parse(privateItemsRaw));
    if (res.success) {
      return res.output;
    }
    throw new Error(
      `failed to parse Mutelist privateItems: ${JSON.stringify(res.issues, null, 2)}`,
    );
  }
  throw new Error("failed to decrypt Mutelist");
};

export const parseMuteList = (input: NostrEvent) => {
  if (input.kind !== kinds.Mutelist) {
    throw new Error(`kind is not Mutelist: ${input.kind}`);
  }

  const res = v.safeParse(muteListTag, input.tags);
  if (res.success) {
    return {
      kind: input.kind,
      pubkey: input.pubkey,
      publicItems: res.output,
      /** decryptしていないミュート対象 */
      privateItems: input.content,
    } as const;
  }
  throw new Error(
    `failed to parse Mutelist: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type MuteItems = v.InferOutput<typeof muteListTag>;

export type MuteList = ReturnType<typeof parseMuteList>;

export const muteItemsToTags = (items: MuteItems) => {
  // TODO: 各タグのconstructorを作る
  const events = items.events.map((id) => ["e", id]);
  const users = items.users.map((pubkey) => ["p", pubkey]);
  const hashtags = items.hashtags.map((tag) => ["t", tag]);
  const words = items.words.map((word) => ["word", word]);
  return [...events, ...users, ...hashtags, ...words];
};
