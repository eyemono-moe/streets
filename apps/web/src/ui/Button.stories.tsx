import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
import Button, {
  ButtonLink,
  type ButtonProps,
  type ButtonVariant,
} from "./Button";

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "danger",
  "muted",
  "ghost",
  "overlay",
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

export const 外部リンク: Story = {
  render: () => (
    <ButtonLink
      variant="primary"
      icon="i-material-symbols:open-in-new-rounded"
      href="https://example.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      外部ページを開く
    </ButtonLink>
  ),
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

/** overlay は写真や暗い背景の上に重ねて使う。 */
export const 写真の上: Story = {
  render: () => (
    <div
      class="flex items-center gap-2 bg-center bg-cover p-6"
      style={{ "background-image": `url(${landscapeUrl})` }}
    >
      <Button
        variant="overlay"
        icon="i-material-symbols:close-rounded"
        aria-label="閉じる"
      />
      <Button variant="overlay" icon="i-material-symbols:open-in-new-rounded">
        元の画像を開く
      </Button>
      <Button
        variant="overlay"
        icon="i-material-symbols:chevron-left-rounded"
        aria-label="前へ"
      />
    </div>
  ),
};
