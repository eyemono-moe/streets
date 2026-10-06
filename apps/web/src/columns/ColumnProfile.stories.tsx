import type { ColumnDef } from "@streets/core/deck/deck";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { setColumnPartOpen, columnPartOpen } from "../column-part-memory";
import { MobileTopBar } from "../deck/Nav";
import ProfileHeaderView from "../profile/ProfileHeaderView";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import { ColumnHeader } from "./ColumnHeader";
import ColumnProfile from "./ColumnProfile";

const person = createStoryAuthor(93, {
  name: "long-person-name",
  displayName: "長い名前を持つ人のユーザー詳細",
  about: "自己紹介を隠すと、下の投稿がカラムの先頭へ上がります。".repeat(3),
});

const ProfileStory = (props: {
  id: string;
  open: boolean;
  narrow?: boolean;
  mobile?: boolean;
}) => {
  const column: ColumnDef = {
    id: props.id,
    title: "ユーザー詳細",
    source: { kind: "user", pubkey: person.pubkey },
  };
  setColumnPartOpen(column.id, "profile", props.open);
  return (
    <EventSceneProvider scene={{ events: [person.profile()] }}>
      <Mediates
        handle={(event) => {
          if (event.type !== "column-part/set-open") return false;
          setColumnPartOpen(event.column, event.part, event.open);
          return true;
        }}
      >
        <div
          class="border border-primary bg-primary"
          style={{
            width: props.narrow ? "280px" : props.mobile ? "390px" : "360px",
          }}
        >
          {props.mobile ? (
            <MobileTopBar
              pubkey={undefined}
              column={column}
              temporary={false}
              settingsOpen={false}
              onLogout={() => {}}
              feedbackUrl={null}
            />
          ) : (
            <ColumnHeader column={column} open={false} onTitle={() => {}} />
          )}
          <ColumnProfile
            id={column.id}
            open={columnPartOpen(column.id, "profile")}
          >
            <ProfileHeaderView pubkey={person.pubkey} followeeCount={128} />
          </ColumnProfile>
          <div class="border-primary border-t p-3 text-caption">投稿のタブ</div>
          <p class="p-3 text-body">カラムの本文</p>
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "カラム/ユーザー詳細の開閉",
  component: ProfileStory,
} satisfies Meta<typeof ProfileStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 開いた状態: Story = {
  args: { id: "story-profile-open", open: true },
};

export const 閉じた状態: Story = {
  args: { id: "story-profile-closed", open: false },
};

export const 狭いカラム: Story = {
  args: { id: "story-profile-narrow", open: true, narrow: true },
};

export const 狭い画面の上部バー: Story = {
  args: { id: "story-profile-mobile", open: true, mobile: true },
};
