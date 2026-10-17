import { type FollowSet, readFollowSet } from "@streets/core/lists/follow-set";
import type { NostrEvent } from "@streets/core/nostr/event";
import { buildReaction } from "@streets/core/nostr/reaction";
import { buildReply } from "@streets/core/nostr/reply";
import { buildRepost } from "@streets/core/nostr/repost";
import { type SampleAuthor, createSampleAuthor } from "./sample-author";

/** 見本に並べるもの。`events` は見本の読み取り層に入れる全部（プロフィールを含む）。 */
export type SampleScene<T> = { events: NostrEvent[]; items: T };

// 実在の人と重ならないよう、架空の人だけを使う。
const people = () => ({
  you: createSampleAuthor(9001, { name: "you", displayName: "あなた" }),
  mio: createSampleAuthor(9002, { name: "mio", displayName: "Mio" }),
  ren: createSampleAuthor(9003, { name: "ren", displayName: "Ren" }),
  kai: createSampleAuthor(9004, { name: "kai", displayName: "Kai" }),
  sora: createSampleAuthor(9005, { name: "sora", displayName: "そら" }),
  nanami: createSampleAuthor(9006, { name: "nanami", displayName: "七海" }),
  haru: createSampleAuthor(9007, { name: "haru", displayName: "はる" }),
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
    note(
      mio,
      "カラムを並べて、ホームと通知と #coffee を一度に眺めるのが最近の朝の習慣。",
      3,
    ),
    note(sora, "ベランダのバジルが元気すぎる。今日はパスタにしよう。", 12),
    note(
      kai,
      "この前教えてもらったタイマーアプリ、作曲のときにも使えて便利だった。",
      25,
    ),
    note(
      nanami,
      "写真のトリミング、4px と 8px で迷ったら並べて遠くから見る。",
      41,
    ),
    note(ren, "駅前のパン屋、火曜だけ出るシナモンロールがある。", 58),
    note(haru, "雨の日は積んでいた本を崩す日。", 75),
  ];
  return {
    events: [...profiles([mio, ren, kai, sora, nanami, haru]), ...notes],
    items: notes,
  };
};

/** 自分宛の通知。新しい順。 */
export const sampleNotifications = (): SampleScene<NostrEvent[]> => {
  const { you, mio, ren, kai, sora, nanami, haru } = people();
  const morning = note(
    you,
    "カラムを並べて、ホームと通知と #coffee を一度に眺めるのが最近の朝の習慣。",
    90,
  );
  const timer = note(
    you,
    "作業用のタイマー、25 分より 40 分のほうが合っている気がする。",
    300,
  );
  const items = [
    like(ren, morning, 2),
    reply(kai, timer, "40 分派です。作曲のときにも使えて便利だった。", 9),
    repost(sora, morning, 16),
    like(nanami, timer, 30),
    like(haru, timer, 31),
    like(mio, timer, 33),
  ];
  return {
    events: [
      ...profiles([you, mio, ren, kai, sora, nanami, haru]),
      morning,
      timer,
      ...items,
    ],
    items,
  };
};

/** フォローしている人のリアクション・リポスト。新しい順。 */
export const sampleActivity = (): SampleScene<NostrEvent[]> => {
  const { mio, ren, kai, sora, nanami, haru } = people();
  const bread = note(
    ren,
    "駅前のパン屋、火曜だけ出るシナモンロールがある。",
    120,
  );
  const photo = note(
    nanami,
    "写真のトリミング、4px と 8px で迷ったら並べて遠くから見る。",
    180,
  );
  const items = [
    like(mio, bread, 4),
    like(kai, bread, 6),
    repost(sora, photo, 14),
    like(haru, photo, 22),
    like(mio, photo, 35),
  ];
  return {
    events: [
      ...profiles([mio, ren, kai, sora, nanami, haru]),
      bread,
      photo,
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
    list("music", "音楽の話", "曲を作っている人たち", [kai, haru]),
    list("food", "ごはん", "料理と食べ歩き", [sora, ren, mio]),
    list("photo", "写真", "撮る人・見る人", [nanami, mio]),
  ];
  return {
    events: [...profiles([you, mio, ren, kai, sora, nanami, haru]), ...lists],
    items: lists.map(readFollowSet),
  };
};
