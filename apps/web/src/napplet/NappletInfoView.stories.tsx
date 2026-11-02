import type { NappletManifest } from "@streets/core/napplet/manifest";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import clipUrl from "../storybook/media-clip.mp4";
import landscapeUrl from "../storybook/media-landscape.svg";
import portraitUrl from "../storybook/media-portrait.svg";
import { createStoryAuthor } from "../storybook/story-events";
import type { NappletPreview, NappletScreenshot } from "./napplet-media";
import NappletInfoView from "./NappletInfoView";
import { STREETS_NAPPLET_DOMAINS } from "./streets-host";

const author = createStoryAuthor(520, {
  name: "アップレットの作者",
  picture: avatarUrl,
});

const manifest: NappletManifest = {
  eventId: "a".repeat(64),
  kind: 35129,
  pubkey: author.pubkey,
  createdAt: 1_760_000_000,
  identifier: "chronofeed",
  artifactHash:
    "e6d6d39007a81d16ff9da5e827a661490e3a691a05c005ed40807cd56409a2ed",
  description:
    "フォロー中の人の投稿とリポストを、新しい順に並べます。読むだけで、書き込みはしません。",
  title: "Chronofeed",
  servers: ["https://cdn.example.invalid", "https://blossom.example.invalid"],
  requires: ["identity", "outbox", "relay"],
  optional: ["resource", "theme"],
  archetypes: ["note"],
  intents: [{ convention: "napplet:note/open", params: ["id"] }],
  source: "https://example.invalid/chronofeed",
  screenshots: [],
  legacy: false,
};

const screenshots: NappletScreenshot[] = [
  {
    hash: "1".repeat(64),
    mime: "image/png",
    dim: { width: 1200, height: 750 },
    alt: "フォロー中の人の投稿が新しい順に並んだ画面",
    url: landscapeUrl,
  },
  {
    hash: "2".repeat(64),
    mime: "image/webp",
    dim: { width: 750, height: 1200 },
    alt: "スマートフォンの幅で開いた画面",
    url: portraitUrl,
  },
  // 取得中。dim があれば、その形の枠を先に出す。
  { hash: "3".repeat(64), dim: { width: 1200, height: 750 } },
];

const preview: NappletPreview = {
  hash: "4".repeat(64),
  mime: "video/mp4",
  dim: { width: 960, height: 600 },
  duration: 8.5,
  size: 921_600,
  alt: "投稿を流して読む様子",
  state: "idle",
};

type Props = {
  lookup: Parameters<typeof NappletInfoView>[0]["lookup"];
  icon: boolean;
  screenshots?: NappletScreenshot[];
  preview?: NappletPreview;
  installed?: boolean;
  grants?: { key: string; label: string }[];
  /** カラムの幅（px）。 */
  width: number;
};

const InfoStory: Component<Props> = (props) => (
  <EventSceneProvider scene={{ events: [author.profile()] }}>
    <div
      class="border border-primary bg-primary"
      style={{ width: `${props.width}px` }}
    >
      <NappletInfoView
        lookup={props.lookup}
        iconUrl={props.icon ? avatarUrl : undefined}
        screenshots={props.screenshots}
        preview={props.preview}
        onPlayPreview={() => {}}
        supported={new Set(STREETS_NAPPLET_DOMAINS)}
        installed={props.installed}
        grants={props.grants}
        onRevoke={() => {}}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "カラム/アップレットの情報",
  component: InfoStory,
  args: {
    lookup: { phase: "found", manifest },
    icon: true,
    installed: false,
    width: 360,
  },
  argTypes: { lookup: { control: false } },
} satisfies Meta<typeof InfoStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

export const インストール済み: Story = { args: { installed: true } };

/** 「今後は確認しない」で通している書き込みや、許した通知がある。⊖ で取り消す。 */
export const 許可していることがある: Story = {
  args: {
    installed: true,
    grants: [
      { key: "publish:1", label: "短いテキスト投稿" },
      {
        key: "publishEncrypted:30078",
        label: "アプリの設定（暗号化して送る）",
      },
    ],
  },
};

/** アイコンが無い・取れない・照合が通らないときは、汎用の絵にする。 */
export const アイコンが無い: Story = { args: { icon: false } };

/** 2026-10 より前の形。必須と任意を分けていないので、すべて「使う機能」に並ぶ。 */
export const 古い形式: Story = {
  args: {
    lookup: {
      phase: "found",
      manifest: {
        ...manifest,
        title: "Minesweeper",
        description:
          "A Windows XP-style Minesweeper game with a Nostr friends feed.",
        requires: ["common", "config", "identity", "outbox"],
        optional: [],
        source: undefined,
        legacy: true,
      },
    },
  },
};

export const 長い説明と知らない機能: Story = {
  args: {
    lookup: {
      phase: "found",
      manifest: {
        ...manifest,
        title: "とても長い名前のアップレットで、カラムの幅に収まらないもの",
        description: "説明がとても長いアップレット。".repeat(12),
        requires: ["mesh", "upload", "cvm", "future-domain"],
      },
    },
  },
};

export const 読み込み中: Story = { args: { lookup: { phase: "loading" } } };

export const 見つからない: Story = { args: { lookup: { phase: "missing" } } };

export const 壊れている: Story = {
  args: { lookup: { phase: "invalid", error: "multiple-hashes" } },
};

export const 狭いカラム: Story = { args: { width: 240 } };

/** 画面の見本（スクリーンショットとプレビュー動画）がある。3 枚目は取得中。 */
export const 画面の見本がある: Story = { args: { screenshots, preview } };

/** 押すまで動画は取らない。押すと読み込み、取れたらその場で再生する。 */
export const プレビュー動画を読み込み中: Story = {
  args: { screenshots, preview: { ...preview, state: "loading" } },
};

export const プレビュー動画を再生: Story = {
  args: {
    screenshots,
    preview: { ...preview, state: "ready", url: clipUrl },
  },
};

/** 照合が通らない・形が違う・ブラウザが再生できない。 */
export const プレビュー動画を再生できない: Story = {
  args: { screenshots, preview: { ...preview, state: "failed" } },
};

/** 大きさも長さも書かれていないプレビュー。 */
export const プレビュー動画だけ: Story = {
  args: { preview: { hash: "5".repeat(64), state: "idle" } },
};

export const 画面の見本を狭いカラムで: Story = {
  args: { screenshots, preview, width: 240 },
};
