import { GUIDES } from "@streets/core/signal/guides";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import { GuidePanelView } from "./GuidePanel";

const Demo = (props: { path: string; narrow: boolean }) => (
  <Mediates handle={() => true}>
    <div
      class="relative flex h-[600px] overflow-hidden border border-primary bg-tertiary"
      classList={{ "w-[390px]": props.narrow, "w-[1000px]": !props.narrow }}
    >
      <div class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <h2 class="font-600">メインカラム</h2>
        <p>案内を開いても、このカラムを見られます。</p>
      </div>
      <div
        class="absolute right-0 bottom-0 border-primary bg-primary shadow-xl"
        classList={{
          "top-0 w-90 border-l": !props.narrow,
          "left-0 h-[70%] border-t": props.narrow,
        }}
      >
        <GuidePanelView path={props.path} />
      </div>
    </div>
  </Mediates>
);

const meta = {
  title: "Signal/カラムと案内パネル",
  component: Demo,
  args: { path: "/help", narrow: false },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 広い画面で案内を探す: Story = {};
export const 広い画面で操作を確認する: Story = {
  args: { path: GUIDES[4].path },
};
export const 狭い画面で案内を探す: Story = {
  args: { narrow: true },
  globals: { viewport: { value: "mobile1" } },
};
export const 狭い画面で操作を確認する: Story = {
  args: { path: GUIDES[4].path, narrow: true },
  globals: { viewport: { value: "mobile1" } },
};
