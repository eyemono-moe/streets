import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import MobileMenu from "./MobileMenu";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

const longName = createStoryAuthor(57, {
  name: "long",
  displayName:
    "とてもとても長い表示名を付けている人のアカウントで、メニューの幅には収まらない",
});

const status = viewer.event({
  kind: 30315,
  tags: [["d", "general"]],
  content: "☕ 休憩中",
});

const Demo = (props: {
  pubkey: string | undefined;
  open: boolean;
  pulling?: number;
  feedback?: boolean;
}) => (
  <EventSceneProvider
    scene={{
      events: [viewer.profile(), longName.profile(), status],
      viewer,
    }}
  >
    <Mediates handle={() => true}>
      <div class="h-[640px] w-[390px] bg-secondary" />
      <MobileMenu
        pubkey={props.pubkey}
        open={props.open}
        pulling={props.pulling}
        onLogout={() => {}}
        feedbackUrl={
          props.feedback === false
            ? null
            : "https://docs.google.com/forms/d/e/example/viewform?entry.1={context}"
        }
      />
    </Mediates>
  </EventSceneProvider>
);

const meta = {
  title: "デッキ/狭い画面のメニュー",
  component: Demo,
  args: { pubkey: viewer.pubkey, open: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Meta<typeof Demo>;

export default meta;
type S = StoryObj<typeof meta>;

export const 開いたところ: S = {};

export const 名前が長くステータスが無い: S = {
  args: { pubkey: longName.pubkey },
};

/** ログインしていなければ、アカウントの代わりにログインを置き、ログアウトを出さない。 */
export const ログインしていない: S = {
  args: { pubkey: undefined, feedback: false },
};

/** 画面を右へ払って、半分まで引き出したところ。後ろの暗さも出ている割合に合わせる。 */
export const 引き出している途中: S = {
  args: { open: false, pulling: 0.5 },
};
