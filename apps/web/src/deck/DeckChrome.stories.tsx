import { type ColumnDef, TIMELINE_KINDS } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import { Header } from "./Column";
import { Sidebar } from "./Nav";

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
          <Header column={home} open={false} draggable onTitle={() => {}} />
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
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};
