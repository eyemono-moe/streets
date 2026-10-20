import type { NappletManifest } from "@streets/core/napplet/manifest";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
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
  legacy: false,
};

type Props = {
  lookup: Parameters<typeof NappletInfoView>[0]["lookup"];
  icon: boolean;
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

/** 「今後は確認しない」で通している書き込みがある。⊖ で毎回確かめる形に戻す。 */
export const 確かめずに書き込める: Story = {
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
