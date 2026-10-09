import type { NostrEvent } from "@streets/core/nostr/event";
import {
  encodeBech32,
  encodeNaddr,
  encodeNevent,
} from "@streets/core/nostr/nip19";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createStoryAuthor } from "../../storybook/story-events";
import { EventStory, alice, bob, eventStoryMeta, scene } from "./event-story";

const longName = createStoryAuthor(66, {
  name: "long",
  displayName:
    "とても長い表示名のひと（長い名前が狭いカラムでも 1 行に収まるか見る）",
});
const noProfile = createStoryAuthor(77, {});

const nevent = (target: NostrEvent) => {
  const entity = encodeNevent({
    id: target.id,
    author: target.pubkey,
    eventKind: target.kind,
  });
  if (!entity) throw new Error("nevent を作れません");
  return `nostr:${entity}`;
};
/** 作者と種類を持たない参照。取得するまで何の投稿か分からない。 */
const bare = (target: NostrEvent) => `nostr:${encodeBech32("note", target.id)}`;

const note = bob.note("引用される投稿。");
const article = bob.event({
  kind: 30_023,
  tags: [
    ["d", "streets"],
    ["title", "記事"],
  ],
  content: "記事の本文。",
});
const naddr = `nostr:${encodeNaddr({ identifier: "streets", pubkey: bob.pubkey, eventKind: 30_023 })}`;
const picture = bob.event({
  kind: 20,
  tags: [["title", "写真"]],
  content: "写真",
});
const comment = bob.event({ kind: 1111, tags: [], content: "コメント" });
const unknown = bob.event({ kind: 31_337, tags: [], content: "" });
const longNote = longName.note("長い名前の人の投稿。");
const noProfileNote = noProfile.note("プロフィールが無い人の投稿。");
const lost = bob.note("取れない投稿。");

const host = (...refs: string[]) =>
  alice.note(
    `高密度の本文の途中に、${refs.join(" と ")} が入る。そのあとも文章が続く。`,
  );

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/高密度の引用",
  args: { size: "compact" },
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const story = (
  event: NostrEvent,
  events: NostrEvent[],
  extra: { missingIds?: string[]; width?: number } = {},
): Story => ({
  args: {
    event,
    scene: {
      ...scene(event, longName.profile(), ...events),
      ...(extra.missingIds ? { missingIds: extra.missingIds } : {}),
    },
    ...(extra.width ? { width: extra.width } : {}),
  },
});

const textNote = host(nevent(note));
export const 投稿 = story(textNote, [note]);

const articleHost = host(naddr);
export const 記事 = story(articleHost, [article]);

const pictureHost = host(nevent(picture));
export const 画像の投稿 = story(pictureHost, [picture]);

const commentHost = host(nevent(comment));
export const コメント = story(commentHost, [comment]);

const unknownHost = host(nevent(unknown));
export const 知らない種類 = story(unknownHost, [unknown]);

const longHost = host(nevent(longNote));
export const 名前が長い = story(longHost, [longNote]);
export const 名前が長く幅が狭い = story(longHost, [longNote], { width: 240 });

const noProfileHost = host(nevent(noProfileNote));
export const プロフィールが無い = story(noProfileHost, [noProfileNote]);

/** 作者と種類を持たない参照は、取得できるまで棒を出す。失敗には見せない。 */
const loadingHost = host(bare(note));
export const 取得中 = story(loadingHost, []);

/** 取れなかったときは、短くした文字列のリンクのまま。 */
const lostHost = host(bare(lost));
export const 取れない = story(lostHost, [], { missingIds: [lost.id] });

const manyHost = host(nevent(note), naddr, bare(note));
export const 複数並ぶ = story(manyHost, [note, article]);
