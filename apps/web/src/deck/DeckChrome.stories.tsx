import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ColumnHeader } from "../columns/ColumnHeader";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import ColumnAccentBar from "./ColumnAccentBar";
import FeedbackLink from "./FeedbackLink";
import { ComposeFab, MobileTabBar, MobileTopBar, Sidebar } from "./Nav";

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

/** 切り替えのメニューに並べるデッキ。 */
const decks = [
  { id: "pc", name: "PC" },
  { id: "phone", name: "スマホ" },
  { id: "search", name: "調べもの用のとても長い名前のデッキ" },
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
          <ColumnHeader column={home} open={false} grip onTitle={() => {}} />
        </div>
      </Mediates>
    </EventSceneProvider>
  ),
};

/** 上端の帯が破線なら一時カラム（デッキに保存していない）、実線なら保存したカラム。 */
export const 一時カラムのヘッダー: Story = {
  render: () => (
    <EventSceneProvider scene={{ events: [viewer.profile()] }}>
      <Mediates handle={() => true}>
        {/* デッキと同じく、一時カラムを左端に置き、カラムの右に線を引いて並べる。 */}
        <div class="flex bg-primary">
          <div class="w-[360px] border-primary border-r">
            <ColumnAccentBar temporary />
            <ColumnHeader
              column={home}
              open={false}
              temporary
              onTitle={() => {}}
            />
          </div>
          <div class="w-[360px] border-primary border-r">
            <ColumnAccentBar />
            <ColumnHeader column={home} open={false} grip onTitle={() => {}} />
          </div>
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
            decks={decks}
            activeDeckId="pc"
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
            decks={decks}
            activeDeckId="pc"
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
            decks={decks}
            activeDeckId="pc"
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
  /** 一時カラム。渡すと、それを見ている状態にする。 */
  temp?: ColumnDef;
  /** 右下に浮かぶ投稿ボタンを出す。パネルや自分の入力欄を持つカラムでは出さない。 */
  fab?: boolean;
}) => (
  <EventSceneProvider
    scene={{ events: [viewer.profile(), friend.profile()], viewer }}
  >
    <Mediates handle={() => true}>
      <div class="flex h-[640px] w-[390px] flex-col bg-secondary">
        <ColumnAccentBar temporary={props.temp !== undefined} />
        <MobileTopBar
          pubkey={viewer.pubkey}
          decks={decks}
          activeDeckId="pc"
          column={
            props.temp ??
            props.columns.find((column) => column.id === props.active)
          }
          temporary={props.temp !== undefined}
          settingsOpen={false}
          onLogout={() => {}}
          feedbackUrl="https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
        />
        <div class="relative flex-1">
          <Show when={props.fab ?? props.panel === undefined}>
            <ComposeFab />
          </Show>
        </div>
        <MobileTabBar
          columns={props.columns}
          temp={props.temp}
          active={props.temp?.id ?? props.active}
          panel={props.panel}
        />
      </div>
    </Mediates>
  </EventSceneProvider>
);

export const 狭い画面の上下のバー: Story = {
  render: () => <MobileBars columns={columns} active="home" />,
};

/** 一時カラムでは、上のバーの右に「カラムに残す」と閉じるを出し、上端の帯を破線にする。 */
export const 狭い画面_一時カラムを見ている: Story = {
  render: () => (
    <MobileBars
      columns={columns}
      active={undefined}
      temp={{
        id: "temp",
        title: "ともだち",
        source: { kind: "user", pubkey: friend.pubkey },
      }}
    />
  ),
};

/**
 * カラムの種類ごとの見出しの操作（チャンネルの情報など）も、上のバーに出る。
 * チャンネルは下に自分の入力欄を持つので、右下の投稿ボタンを出さない。
 */
export const 狭い画面_チャンネルのカラム: Story = {
  render: () => {
    const channel: ColumnDef = {
      id: "channel",
      title: "さびれたスナック",
      source: { kind: "channel", id: "a".repeat(64) },
    };
    return (
      <MobileBars
        columns={[...columns, channel]}
        active="channel"
        fab={false}
      />
    );
  },
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
