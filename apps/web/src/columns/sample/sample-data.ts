import { type FollowSet, readFollowSet } from "@streets/core/lists/follow-set";
import type { NostrEvent } from "@streets/core/nostr/event";
import { buildReaction } from "@streets/core/nostr/reaction";
import { buildReply } from "@streets/core/nostr/reply";
import { buildRepost } from "@streets/core/nostr/repost";
import { t } from "../../i18n/locale";
import { type SampleAuthor, createSampleAuthor } from "./sample-author";

/** 見本に並べるもの。`events` は見本の読み取り層に入れる全部（プロフィールを含む）。 */
export type SampleScene<T> = { events: NostrEvent[]; items: T };

// 実在の人と重ならないよう、架空の人だけを使う。見本は呼んだときの言語で作る。
const people = () => ({
  you: createSampleAuthor(9001, {
    name: "you",
    displayName: t("columns.sample.names.you"),
  }),
  mio: createSampleAuthor(9002, { name: "mio", displayName: "Mio" }),
  ren: createSampleAuthor(9003, { name: "ren", displayName: "Ren" }),
  kai: createSampleAuthor(9004, { name: "kai", displayName: "Kai" }),
  sora: createSampleAuthor(9005, {
    name: "sora",
    displayName: t("columns.sample.names.sora"),
  }),
  nanami: createSampleAuthor(9006, {
    name: "nanami",
    displayName: t("columns.sample.names.nanami"),
  }),
  haru: createSampleAuthor(9007, {
    name: "haru",
    displayName: t("columns.sample.names.haru"),
  }),
});

/** いまから `minutes` 分前の時刻。見本は「さっき届いた」ように見せる。 */
const minutesAgo = (minutes: number) =>
  Math.floor(Date.now() / 1000) - minutes * 60;

const profiles = (authors: readonly SampleAuthor[]) =>
  authors.map((author) => author.profile());

const note = (author: SampleAuthor, content: string, minutes: number) =>
  author.event({ kind: 1, tags: [], content }, minutesAgo(minutes));

const like = (author: SampleAuthor, target: NostrEvent, minutes: number) =>
  author.event(buildReaction(target, { type: "like" }), minutesAgo(minutes));

const reply = (
  author: SampleAuthor,
  parent: NostrEvent,
  content: string,
  minutes: number,
) => author.event(buildReply(parent, content), minutesAgo(minutes));

const repost = (author: SampleAuthor, target: NostrEvent, minutes: number) => {
  const draft = buildRepost(target);
  if (!draft) throw new Error("kind:1 以外は kind:6 でリポストできません");
  return author.event(draft, minutesAgo(minutes));
};

/** フォローしている人の投稿の流れ（ホーム・タイムスリップ・ブックマーク）。新しい順。 */
export const sampleTimeline = (): SampleScene<NostrEvent[]> => {
  const { mio, ren, kai, sora, nanami, haru } = people();
  const notes = [
    note(mio, t("columns.sample.notes.hello"), 3),
    note(sora, t("columns.sample.notes.coffee"), 12),
    note(kai, t("columns.sample.notes.portable"), 25),
    note(nanami, t("columns.sample.notes.lime"), 41),
    note(ren, t("columns.sample.notes.bakery"), 58),
    note(haru, t("columns.sample.notes.books"), 75),
  ];
  return {
    events: [...profiles([mio, ren, kai, sora, nanami, haru]), ...notes],
    items: notes,
  };
};

/** 自分宛の通知。新しい順。 */
export const sampleNotifications = (): SampleScene<NostrEvent[]> => {
  const { you, mio, ren, kai, sora, nanami, haru } = people();
  const hello = note(you, t("columns.sample.notes.hello"), 90);
  const items = [
    like(ren, hello, 2),
    reply(kai, hello, t("columns.sample.notes.welcome"), 9),
    repost(sora, hello, 16),
    like(nanami, hello, 30),
    like(haru, hello, 31),
    reply(mio, hello, t("columns.sample.notes.nice"), 45),
  ];
  return {
    events: [
      ...profiles([you, mio, ren, kai, sora, nanami, haru]),
      hello,
      ...items,
    ],
    items,
  };
};

/** フォローしている人のリアクション・リポスト。新しい順。 */
export const sampleActivity = (): SampleScene<NostrEvent[]> => {
  const { mio, ren, kai, sora, nanami, haru } = people();
  const hello = note(ren, t("columns.sample.notes.hello"), 120);
  const coffee = note(nanami, t("columns.sample.notes.coffee"), 180);
  const items = [
    like(mio, hello, 4),
    like(kai, hello, 6),
    repost(sora, coffee, 14),
    like(haru, coffee, 22),
    like(mio, coffee, 35),
  ];
  return {
    events: [
      ...profiles([mio, ren, kai, sora, nanami, haru]),
      hello,
      coffee,
      ...items,
    ],
    items,
  };
};

/** 自分で作ったリスト。 */
export const sampleFollowSets = (): SampleScene<FollowSet[]> => {
  const { you, mio, ren, kai, sora, nanami, haru } = people();
  const list = (
    identifier: string,
    title: string,
    description: string,
    members: readonly SampleAuthor[],
  ) =>
    you.event({
      kind: 30000,
      tags: [
        ["d", identifier],
        ["title", title],
        ["description", description],
        ...members.map((member) => ["p", member.pubkey]),
      ],
      content: "",
    });
  const lists = [
    list(
      "music",
      t("columns.sample.lists.music.title"),
      t("columns.sample.lists.music.description"),
      [kai, haru],
    ),
    list(
      "food",
      t("columns.sample.lists.food.title"),
      t("columns.sample.lists.food.description"),
      [sora, ren, mio],
    ),
    list(
      "photo",
      t("columns.sample.lists.photo.title"),
      t("columns.sample.lists.photo.description"),
      [nanami, mio],
    ),
  ];
  return {
    events: [...profiles([you, mio, ren, kai, sora, nanami, haru]), ...lists],
    items: lists.map(readFollowSet),
  };
};
