import { type AvatarProps, StreetSign } from "@streets/sign";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  title: "UI/Avater",
  component: StreetSign,
  args: {
    name: "test",
  },
  argTypes: {
    name: { control: "text" },
  },
} satisfies Meta<AvatarProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 単体: Story = {};

export const ランダム: Story = {
  render: () => {
    const names = new Array(100).fill(0).map((_, i) => `test-${i + 1}`);

    return (
      <div
        style={{
          display: "flex",
          gap: "1rem",
          "flex-wrap": "wrap",
          padding: "1rem",
        }}
      >
        <For each={names}>
          {(name) => (
            <div
              style={{
                "border-radius": "8px",
                overflow: "hidden",
                "flex-shrink": 0,
              }}
            >
              <StreetSign name={name} size={64} />
            </div>
          )}
        </For>
      </div>
    );
  },
};
