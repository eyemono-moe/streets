import type { Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../../ui-events";
import {
  ActivitySample,
  FollowSetsSample,
  NotificationsSample,
  type SampleGuide,
  TimelineSample,
} from "./SampleColumn";

const body = (what: string) =>
  `いま見えているのは見本です。ログインすると、${what}に変わります。`;

const SAMPLES = {
  notifications: {
    Sample: NotificationsSample,
    heading: "あなたへの返信やリアクションがここに届きます",
    body: body("あなた宛の通知"),
  },
  home: {
    Sample: TimelineSample,
    heading: "フォローしている人の投稿がここに流れます",
    body: body("あなたがフォローしている人の投稿"),
  },
  activity: {
    Sample: ActivitySample,
    heading: "フォローしている人のリアクションやリポストがここに届きます",
    body: body("あなたがフォローしている人の反応"),
  },
  lists: {
    Sample: FollowSetsSample,
    heading: "人をまとめたリストを作れます",
    body: body("あなたが作ったリスト"),
  },
} satisfies Record<string, SampleGuide & { Sample: Component<SampleGuide> }>;

type Props = { kind: keyof typeof SAMPLES; width: string };

const meta = {
  title: "カラム/見本",
  // カラムと同じ高さの箱に入れる。ログインの案内は Actions パネルへ流す。
  component: (props: Props) => (
    <Mediates handle={() => false}>
      <div
        class="h-160 overflow-y-auto border-primary border-x bg-primary"
        style={{ width: props.width }}
      >
        <Dynamic
          component={SAMPLES[props.kind].Sample}
          heading={SAMPLES[props.kind].heading}
          body={SAMPLES[props.kind].body}
        />
      </div>
    </Mediates>
  ),
  args: { kind: "notifications", width: "360px" },
  argTypes: {
    kind: { control: "select", options: Object.keys(SAMPLES) },
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通知: Story = {};

export const ホーム: Story = { args: { kind: "home" } };

export const みんなのアクティビティ: Story = { args: { kind: "activity" } };

export const リスト: Story = { args: { kind: "lists" } };

export const 幅の狭いカラム: Story = { args: { width: "260px" } };

export const 狭い画面: Story = {
  args: { width: "100%" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
