import { type ColumnDef, TIMELINE_KINDS } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import { Sidebar, TabBar } from "./Nav";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

const home: ColumnDef = {
  id: "home",
  title: "ホーム",
  source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
};

const columns: ColumnDef[] = [
  home,
  {
    id: "nostr",
    title: "Nostr",
    source: { kind: "literal", filters: [{ "#t": ["nostr"] }] },
  },
  { id: "notifications", title: "通知", source: { kind: "notifications" } },
];

const meta = {
  title: "デッキ/ヘッダーとサイドバー",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const カラムヘッダー: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        <div class="w-[360px] border-primary border-x">
          <ColumnHeader
            column={home}
            open={false}
            draggable
            onTitle={() => {}}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

export const サイドバー: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        <div class="flex h-[480px] bg-secondary">
          <Sidebar
            pubkey={viewer.pubkey}
            columns={columns}
            onLogout={() => {}}
            feedbackUrl="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

export const フィードバック未設定: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        <div class="flex h-[480px] bg-secondary">
          <Sidebar
            pubkey={viewer.pubkey}
            columns={columns}
            onLogout={() => {}}
            feedbackUrl={null}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

export const 狭い画面の下部ナビ: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        <div class="w-[390px] bg-secondary pt-80">
          <TabBar
            pubkey={viewer.pubkey}
            onLogout={() => {}}
            feedbackUrl="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};
