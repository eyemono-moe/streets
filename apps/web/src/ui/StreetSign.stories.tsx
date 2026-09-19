import { type AvatarProps, StreetSign } from "@streets/sign";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  title: "UI/StreetSign",
  component: StreetSign,
  args: { name: "test", class: "size-16" },
  argTypes: { name: { control: "text" } },
} satisfies Meta<AvatarProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 単体: Story = {};

export const 名前ごとの形: Story = {
  render: () => (
    <div class="flex flex-wrap gap-4">
      <For each={Array.from({ length: 20 }, (_, index) => `test-${index}`)}>
        {(name) => <StreetSign name={name} class="size-16 rounded-2" />}
      </For>
    </div>
  ),
};
