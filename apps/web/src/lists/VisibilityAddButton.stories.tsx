import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import VisibilityAddButton from "./VisibilityAddButton";

const Story = (props: {
  initial: ItemVisibility;
  privateReady: boolean;
  open: boolean;
}) => {
  const [value, setValue] = createSignal<ItemVisibility>(props.initial);
  return (
    <div class="flex h-56 w-96 items-start justify-end p-4">
      <VisibilityAddButton
        value={value()}
        privateReady={props.privateReady}
        onChange={setValue}
        defaultOpen={props.open}
      />
    </div>
  );
};

const meta = {
  title: "リスト/公開範囲を選んで足す",
  component: Story,
  args: { initial: "private", privateReady: true, open: false },
} satisfies Meta<{
  initial: ItemVisibility;
  privateReady: boolean;
  open: boolean;
}>;

export default meta;
type S = StoryObj<typeof meta>;

export const 非公開で足す: S = {};
export const 公開で足す: S = { args: { initial: "public" } };
export const メニューを開いた: S = { args: { open: true } };
export const 非公開を扱えないログイン: S = {
  args: { privateReady: false, open: true },
};
export const 英語: S = {
  args: { open: true },
  globals: { locale: "en" },
};
