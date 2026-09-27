import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import landscapeUrl from "../storybook/media-landscape.svg?no-inline";
import Button from "./Button";
import IconButton, {
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from "./IconButton";

const SIZES: IconButtonSize[] = ["sm", "md", "lg"];
const VARIANTS: IconButtonVariant[] = [
  "ghost",
  "filled",
  "primary",
  "secondary",
  "danger",
  "muted",
];

const meta = {
  title: "UI/IconButton",
  component: IconButton,
  args: {
    icon: "i-material-symbols:more-horiz",
    label: "そのほかの操作",
    variant: "ghost",
    size: "sm",
    circle: false,
    active: false,
    disabled: false,
  },
  argTypes: {
    variant: { control: "inline-radio", options: [...VARIANTS, "overlay"] },
    size: { control: "inline-radio", options: SIZES },
  },
} satisfies Meta<IconButtonProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 単体: Story = {};

/** 種類 × 大きさ。押せない状態と、入っている状態（active）も並べる。 */
export const 一覧: Story = {
  render: () => (
    <div class="flex flex-col gap-3 p-4">
      <For each={VARIANTS}>
        {(variant) => (
          <div class="flex flex-wrap items-center gap-2">
            <span class="c-secondary w-20 text-caption">{variant}</span>
            <For each={SIZES}>
              {(size) => (
                <IconButton
                  variant={variant}
                  size={size}
                  icon="i-material-symbols:close-rounded"
                  label={`閉じる（${size}）`}
                />
              )}
            </For>
            <IconButton
              variant={variant}
              icon="i-material-symbols:close-rounded"
              label="閉じる（押せない）"
              disabled
            />
            <IconButton
              variant={variant}
              circle
              icon="i-material-symbols:close-rounded"
              label="閉じる（丸）"
            />
          </div>
        )}
      </For>
      <div class="flex items-center gap-2">
        <span class="c-secondary w-20 text-caption">active</span>
        <IconButton
          icon="i-material-symbols:star-outline-rounded"
          label="お気に入りに入れる"
        />
        <IconButton
          icon="i-material-symbols:star-rounded"
          label="お気に入りから外す"
          active
        />
      </div>
    </div>
  ),
};

/** 置く場所ごとの大きさ。見出しや行の中は sm、道具の並びは md、サイドバーは lg。 */
export const 置く場所: Story = {
  render: () => (
    <div class="flex w-95 flex-col gap-4 p-4">
      <div class="flex h-12 items-center gap-1 border border-primary px-3">
        <span class="min-w-0 flex-1 truncate font-600 text-body">
          カラムの見出し
        </span>
        <IconButton
          icon="i-material-symbols:star-rounded"
          label="お気に入りから外す"
          active
        />
        <IconButton
          icon="i-material-symbols:info-outline-rounded"
          label="チャンネルの情報"
        />
        <IconButton icon="i-material-symbols:more-horiz" label="カラムの設定" />
      </div>
      <div class="flex items-center gap-1 border border-primary p-2">
        <IconButton
          size="md"
          icon="i-material-symbols:image-outline-rounded"
          label="画像を添える"
        />
        <IconButton
          size="md"
          icon="i-material-symbols:add-reaction-outline-rounded"
          label="絵文字を挿入"
        />
        <span class="flex-1" />
        <Button variant="primary" icon="i-material-symbols:send-rounded">
          投稿
        </Button>
      </div>
      <div class="flex w-14 flex-col items-center gap-1 border border-primary py-2">
        <IconButton
          size="lg"
          icon="i-material-symbols:home-outline-rounded"
          label="ホーム"
        />
        <IconButton
          size="lg"
          icon="i-material-symbols:search-rounded"
          label="検索"
        />
      </div>
    </div>
  ),
};

export const 写真の上: Story = {
  render: () => (
    <div
      class="flex items-center gap-2 bg-center bg-cover p-6"
      style={{ "background-image": `url(${landscapeUrl})` }}
    >
      <For each={SIZES}>
        {(size) => (
          <IconButton
            variant="overlay"
            size={size}
            circle
            icon="i-material-symbols:close-rounded"
            label="閉じる"
          />
        )}
      </For>
    </div>
  ),
};
