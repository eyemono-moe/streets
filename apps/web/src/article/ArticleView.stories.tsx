import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { profiles, viewer } from "../note/event-stories/event-story";
import { EventSceneProvider } from "../storybook/EventScene";
import ArticleView from "./ArticleView";
import {
  bareArticle,
  fullArticle,
  longTitleArticle,
  referencedNote,
} from "./story-articles";

const Reader: Component<{ event: NostrEvent; width: number }> = (props) => (
  <EventSceneProvider
    scene={{ events: [...profiles, props.event, referencedNote], viewer }}
  >
    <div style={{ width: `${props.width}px` }}>
      <ArticleView event={props.event} />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "長文記事/読む画面",
  component: Reader,
  args: { width: 420 },
} satisfies Meta<typeof Reader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 見出し・リスト・コード・表・画像・nostr: の参照・HTML（文字のまま）を並べた記事。 */
export const いろいろな書式: Story = { args: { event: fullArticle } };

export const 題名も画像も無い: Story = { args: { event: bareArticle } };

export const 長い題名と読めない画像: Story = {
  args: { event: longTitleArticle },
};

export const 狭いカラム: Story = { args: { event: fullArticle, width: 300 } };
