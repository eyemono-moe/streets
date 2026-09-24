import { type ColumnDef, TIMELINE_KINDS } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import FeedbackLink from "./FeedbackLink";
import { MobileTabBar, MobileTopBar, Sidebar } from "./Nav";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

// ユーザーのカラムは、その人のアイコンで並ぶ。
const friend = createStoryAuthor(56, {
  name: "friend",
  displayName: "ともだち",
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
  {
    id: "friend",
    title: "ともだち",
    source: { kind: "user", pubkey: friend.pubkey },
  },
];

/** 狭い画面で、帯を横に送らないと入りきらない数。 */
const many: ColumnDef[] = [
  ...columns,
  ...["猫", "犬", "写真", "音楽", "旅行"].map((tag, index): ColumnDef => ({
    id: `tag-${index}`,
    title: tag,
    source: { kind: "literal", filters: [{ "#t": [tag] }] },
  })),
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
            panel={undefined}
            numbers
            onLogout={() => {}}
            feedbackUrl="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

export const パネルを開いているサイドバー: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        <div class="flex h-[480px] bg-secondary">
          <Sidebar
            pubkey={viewer.pubkey}
            columns={columns}
            panel="search"
            numbers
            onLogout={() => {}}
            feedbackUrl={null}
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
            panel={undefined}
            numbers
            onLogout={() => {}}
            feedbackUrl={null}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

export const フィードバック案内: Story = {
  render: () => (
    <div class="grid min-h-120 place-items-center bg-secondary p-4">
      <FeedbackLink
        size="sidebar"
        initialOpen
        template="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
      />
    </div>
  ),
};

const MobileBars = (props: {
  columns: ColumnDef[];
  active: string | undefined;
  panel?: "search" | "add-column";
}) => (
  <EventSceneProvider
    scene={{ events: [viewer.profile(), friend.profile()], viewer }}
  >
    <Mediates handle={() => true}>
      <div class="flex h-[640px] w-[390px] flex-col bg-secondary">
        <MobileTopBar
          pubkey={viewer.pubkey}
          column={props.columns.find((column) => column.id === props.active)}
          temporary={false}
          settingsOpen={false}
          onLogout={() => {}}
          feedbackUrl="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
        />
        <div class="flex-1" />
        <MobileTabBar
          columns={props.columns}
          temp={undefined}
          active={props.active}
          panel={props.panel}
        />
      </div>
    </Mediates>
  </EventSceneProvider>
);

export const 狭い画面の上下のバー: Story = {
  render: () => <MobileBars columns={columns} active="home" />,
};

export const 狭い画面_ユーザーのカラムを選ぶ: Story = {
  render: () => <MobileBars columns={columns} active="friend" />,
};

export const 狭い画面_カラムが多い: Story = {
  render: () => <MobileBars columns={many} active="tag-4" />,
};

export const 狭い画面_検索を開いている: Story = {
  render: () => (
    <MobileBars columns={columns} active={undefined} panel="search" />
  ),
};
