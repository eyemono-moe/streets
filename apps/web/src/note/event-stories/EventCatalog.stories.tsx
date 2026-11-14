import {
  buildChannelCreate,
  buildChannelMessage,
  buildChannelMetadata,
} from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { kindName } from "@streets/core/nostr/kind-support";
import { type Component, For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fullArticle } from "../../article/story-articles";
import { locale } from "../../i18n/locale";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import { EventSceneProvider } from "../../storybook/EventScene";
import clipUrl from "../../storybook/media-clip.mp4";
import landscapeUrl from "../../storybook/media-landscape.svg?no-inline";
import Event from "../Event";
import { RENDERED_KINDS, type RenderedKind } from "../event-kinds";
import { alice, bob, carol, plain, react, scene } from "./event-story";

const absolute = (url: string) => new URL(url, location.href).href;
const imeta = (url: string, mime: string) => [
  "imeta",
  `url ${absolute(url)}`,
  `m ${mime}`,
  "dim 1600x900",
];
const listSet = (kind: number, title: string, tags: string[][]) =>
  bob.event({
    kind,
    content: "",
    tags: [["d", String(kind)], ["title", title], ...tags],
  });

const channel = alice.event(
  buildChannelCreate({
    name: "ねこの画像チャンネル",
    about: "ねこの写真を貼る場所",
    relays: ["wss://relay.example/"],
  }),
);
const picture = alice.event({
  kind: 20,
  content: "夕方の海。風が強かった。",
  tags: [["title", "海辺の散歩"], imeta(landscapeUrl, "image/svg+xml")],
});
const video = alice.event({
  kind: 21,
  content: "テスト用の短い動画です。",
  tags: [["title", "動画の投稿"], imeta(clipUrl, "video/mp4")],
});

/**
 * 表示できる kind ごとに 1 件。`RENDERED_KINDS` をキーにした表なので、kind を
 * 足すと見本の書き忘れを型検査が落とす。
 */
const SAMPLES: { [K in RenderedKind]: NostrEvent } = {
  0: alice.profile(),
  1: plain,
  6: carol.repost(plain),
  7: react(bob, { type: "like" }),
  16: carol.event({
    kind: 16,
    tags: [
      ["e", fullArticle.id, ""],
      ["a", `30023:${fullArticle.pubkey}:streets-long-form`, ""],
      ["k", "30023"],
      ["p", fullArticle.pubkey],
    ],
    content: JSON.stringify(fullArticle),
  }),
  20: picture,
  21: video,
  22: alice.event({
    kind: 22,
    content: "縦長の短い動画。",
    tags: [imeta(clipUrl, "video/mp4")],
  }),
  40: channel,
  41: alice.event(
    buildChannelMetadata(channel.id, {
      name: "ねこの画像チャンネル（改装中）",
      about: "しばらくお休みします",
      relays: ["wss://relay.example/"],
    }),
  ),
  42: bob.event(
    buildChannelMessage(channel.id, "こんばんは。今日もやってますか？"),
  ),
  1068: alice.event({
    kind: 1068,
    content: "今日のお昼、何にする？",
    tags: [
      ["option", "opt0", "ラーメン"],
      ["option", "opt1", "カレー"],
      ["relay", "wss://storybook.invalid/"],
    ],
  }),
  1111: bob.comment(fullArticle, "記事へのコメント。"),
  30000: alice.event({
    kind: 30_000,
    content: "",
    tags: [
      ["d", "dev"],
      ["title", "開発者"],
      ["p", bob.pubkey],
      ["p", carol.pubkey],
    ],
  }),
  30002: listSet(30_002, "日本語のリレー", [
    ["relay", "wss://yabu.me/"],
    ["relay", "wss://r.kojira.io/"],
  ]),
  30003: listSet(30_003, "あとで読む", [["e", plain.id]]),
  30004: listSet(30_004, "長文の記事", [
    ["a", `30023:${fullArticle.pubkey}:streets-long-form`],
  ]),
  30005: listSet(30_005, "動画を集めたもの", [["e", video.id]]),
  30006: listSet(30_006, "写真を集めたもの", [["e", picture.id]]),
  30015: listSet(30_015, "好きな話題", [
    ["t", "nostr"],
    ["t", "東京"],
  ]),
  30023: fullArticle,
  30030: bob.event({
    kind: 30_030,
    content: "",
    tags: [
      ["d", "neko"],
      ["title", "ねこスタンプ"],
      ["emoji", "neko1", emojiUrl],
      ["emoji", "neko2", emojiUrl],
    ],
  }),
  39089: listSet(39_089, "Nostr をはじめた人へ", [
    ["p", alice.pubkey],
    ["p", carol.pubkey],
  ]),
  39092: listSet(39_092, "写真を撮る人たち", [
    ["p", alice.pubkey],
    ["p", carol.pubkey],
  ]),
};

/** 専用の表示が無い kind が、どう出るか。並べて、表示できるものとの違いを見る。 */
const FALLBACKS: NostrEvent[] = [
  alice.event({
    kind: 9802,
    tags: [
      ["r", "https://example.invalid/essay"],
      ["alt", "記事「マルチカラムの作り方」からのハイライト"],
    ],
    content: "カラムは一覧ではなく、問いの形をしている。",
  }),
  alice.event({
    kind: 31923,
    tags: [
      ["d", "meetup"],
      ["title", "Nostr 勉強会"],
    ],
    content: "",
  }),
  alice.event({ kind: 12345, tags: [], content: "{}" }),
  alice.event({ kind: 4, tags: [], content: "暗号文?iv=..." }),
];

const Catalog: Component<{ events: NostrEvent[] }> = (props) => (
  <EventSceneProvider
    scene={scene(...props.events, plain, fullArticle, channel, picture, video)}
  >
    <div class="flex flex-wrap items-start gap-4">
      <For each={props.events}>
        {(event) => (
          <section class="flex w-[360px] flex-col gap-1">
            <h2 class="c-secondary text-caption">
              kind:{event.kind} {kindName(event.kind, locale())}
            </h2>
            <Event event={event} size="normal" />
          </section>
        )}
      </For>
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "イベント/一覧",
  component: Catalog,
  parameters: { layout: "padded" },
  argTypes: { events: { control: false } },
} satisfies Meta<typeof Catalog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Streets が専用の形で描ける kind を、1 件ずつ並べる。 */
export const 表示できるもの: Story = {
  args: { events: RENDERED_KINDS.map((kind) => SAMPLES[kind]) },
};

/** 専用の表示が無い kind。名前と説明だけを出すもの、番号だけのもの、何も出さないもの。 */
export const 専用の表示が無いもの: Story = {
  args: { events: FALLBACKS },
};
