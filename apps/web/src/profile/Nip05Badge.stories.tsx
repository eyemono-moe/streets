import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Nip05View } from "./Nip05Badge";

const meta = {
  title: "ユーザー/Nip05View",
  component: Nip05View,
  args: { label: "alice@example.com", status: "verified" },
  argTypes: {
    status: {
      control: "inline-radio",
      options: ["pending", "verified", "mismatch", "unreachable"],
    },
  },
  decorators: [
    (Story) => (
      <div class="flex w-[240px] border border-primary p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Nip05View>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 確かめている: Story = { args: { status: "pending" } };
export const 確認できた: Story = {};
/** ドメインが別の人を返した、または名前が載っていない。 */
export const 認められていない: Story = { args: { status: "mismatch" } };
/** 接続できないだけ。認められていないとは限らないので、中立の印にする。 */
export const 接続できない: Story = { args: { status: "unreachable" } };
/** `_@domain` はドメインだけを出す。 */
export const ドメインだけ: Story = { args: { label: "example.com" } };
export const 長い: Story = {
  args: {
    label:
      "very-long-handle-that-will-not-fit@a-very-long-subdomain.of-some-long-domain.example",
  },
};
