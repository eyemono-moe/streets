import type { FollowSet } from "@streets/core/lists/follow-set";
import avatar from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";

/** リストのストーリーで並べる人。 */
export const storyPeople = Array.from({ length: 6 }, (_, i) =>
  createStoryAuthor(90 + i, {
    name: `person${i + 1}`,
    displayName:
      i === 5
        ? "とても長い表示名をつけている人で、行に収まらないくらい長い"
        : `ひと ${i + 1}`,
    ...(i % 2 === 0 ? { picture: avatar } : {}),
  }),
);

export const storyViewer = createStoryAuthor(89, {
  name: "me",
  displayName: "わたし",
});

export const storySet = (
  identifier: string,
  fields: Partial<FollowSet> = {},
): FollowSet => ({
  pubkey: storyViewer.pubkey,
  identifier,
  title: identifier,
  description: undefined,
  image: undefined,
  members: [],
  privatePart: "ready",
  ...fields,
});

export const storySets: FollowSet[] = [
  storySet("dev", {
    title: "開発者",
    image: avatar,
    description: "Nostr のクライアントやリレーを作っている人たち",
    members: storyPeople.slice(0, 4).map((person, i) => ({
      pubkey: person.pubkey,
      visibility: i === 3 ? "private" : "public",
    })),
  }),
  storySet("friends", {
    title: "友だち",
    members: storyPeople.slice(4).map((person) => ({
      pubkey: person.pubkey,
      visibility: "private",
    })),
  }),
  storySet("empty", { title: "作ったばかりのリスト" }),
  storySet("long", {
    title:
      "とても長い名前をつけたリストで、カラムの幅に収まらないくらいの長さになっている",
    description:
      "説明もとても長く書いてあって、二行に収まりきらないくらいの長さがあるので、途中で切れて三点リーダーになるはずです。まだまだ続きます。",
    members: [{ pubkey: storyPeople[0]!.pubkey, visibility: "public" }],
  }),
  storySet("mute", { title: undefined }),
];

/** ほかの人が作り、自分が公開で入っているリスト。 */
export const storyMemberOf: FollowSet[] = [
  storySet("nostr-ja", {
    pubkey: storyPeople[1]!.pubkey,
    title: "日本語で Nostr をしている人",
    description: "見かけた人をまとめています",
    members: [storyViewer, ...storyPeople.slice(2, 5)].map((person) => ({
      pubkey: person.pubkey,
      visibility: "public",
    })),
    privatePart: undefined,
  }),
  storySet("bf3a", {
    pubkey: storyPeople[5]!.pubkey,
    title: undefined,
    members: [{ pubkey: storyViewer.pubkey, visibility: "public" }],
    privatePart: undefined,
  }),
];

/** ストーリーで名前を引けるようにする人たちの kind:0。 */
export const storyProfiles = () =>
  [storyViewer, ...storyPeople].map((person) => person.profile());
