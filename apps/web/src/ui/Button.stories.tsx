import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Button, { type ButtonProps, type ButtonVariant } from "./Button";

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "danger",
  "muted",
  "ghost",
];

const meta = {
  title: "UI/Button",
  component: Button,
  args: {
    variant: "primary",
    size: "md",
    shape: "pill",
    block: false,
    disabled: false,
    children: "投稿",
  },
  argTypes: {
    variant: { control: "inline-radio", options: VARIANTS },
    size: { control: "inline-radio", options: ["sm", "md"] },
    shape: { control: "inline-radio", options: ["pill", "rounded"] },
    icon: { control: "text" },
  },
} satisfies Meta<ButtonProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 単体: Story = {};

export const アイコン付き: Story = {
  args: {
    variant: "primary",
    icon: "i-material-symbols:add-rounded",
    children: "追加",
  },
};

/** 種類 × 大きさ × 押せない状態を並べる。 */
export const 一覧: Story = {
  render: () => (
    <div class="flex flex-col gap-3 p-4">
      <For each={VARIANTS}>
        {(variant) => (
          <div class="flex flex-wrap items-center gap-2">
            <span class="c-secondary w-20 text-caption">{variant}</span>
            <Button variant={variant} size="md">
              ボタン
            </Button>
            <Button variant={variant} size="sm">
              小さい
            </Button>
            <Button variant={variant} disabled>
              押せない
            </Button>
            <Button variant={variant} icon="i-material-symbols:check-rounded">
              アイコン
            </Button>
            <Button
              variant={variant}
              icon="i-material-symbols:close-rounded"
              aria-label="閉じる"
            />
            <Button
              variant={variant}
              size="sm"
              icon="i-material-symbols:close-rounded"
              aria-label="閉じる"
            />
          </div>
        )}
      </For>
      <Button
        variant="danger"
        shape="rounded"
        block
        icon="i-material-symbols:delete-outline-rounded"
      >
        横幅いっぱい・角丸（カラムの削除など）
      </Button>
      <div class="w-40">
        <Button variant="primary" block>
          とても長いラベルのボタンが狭い場所に置かれたとき
        </Button>
      </div>
    </div>
  ),
};
