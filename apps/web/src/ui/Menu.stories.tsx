import { Menu } from "@ark-ui/solid/menu";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import IconButton from "./IconButton";
import {
  menuContentClass,
  menuGroupLabelClass,
  menuIconClass,
  menuItemClass,
  menuSeparatorClass,
} from "./menu";

type Item = {
  label: string;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
};

const Items = (props: { items: Item[] }) => (
  <For each={props.items}>
    {(item) => (
      <Menu.Item
        value={item.label}
        disabled={item.disabled}
        class={menuItemClass}
        classList={{ "c-danger": item.danger }}
      >
        <span class={`${item.icon} ${menuIconClass}`} aria-hidden="true" />
        <span class="truncate">{item.label}</span>
      </Menu.Item>
    )}
  </For>
);

/** 組の見出し・区切り・押せない項目・消す項目・2 行の項目を 1 つに並べる。 */
const MenuSample = (props: { width: string }) => (
  <div class="flex h-[440px] w-[360px] justify-end">
    <Menu.Root defaultOpen>
      <Menu.Trigger
        asChild={(trigger) => (
          <IconButton
            {...trigger()}
            icon="i-material-symbols:more-vert"
            label="操作"
          />
        )}
      />
      <Menu.Positioner>
        <Menu.Content class={`${menuContentClass} ${props.width}`}>
          <Menu.ItemGroup>
            <Menu.ItemGroupLabel class={menuGroupLabelClass}>
              このイベント
            </Menu.ItemGroupLabel>
            <Items
              items={[
                {
                  label: "プロフィールにピン留め",
                  icon: "i-material-symbols:keep-outline-rounded",
                },
                {
                  label: "リンクをコピー",
                  icon: "i-material-symbols:link-rounded",
                },
                {
                  label: "この人は Zap を受け取れません",
                  icon: "i-material-symbols:bolt-outline-rounded",
                  disabled: true,
                },
              ]}
            />
            <Menu.Item value="status" class={menuItemClass}>
              <span
                class={`i-material-symbols:add-reaction-outline-rounded c-secondary ${menuIconClass}`}
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-col">
                <span>ステータスを設定</span>
                <span class="c-secondary truncate text-caption">
                  とても長いステータスの本文が入っていて、メニューの幅で切れる
                </span>
              </span>
            </Menu.Item>
          </Menu.ItemGroup>
          <Menu.Separator class={menuSeparatorClass} />
          <Items
            items={[
              {
                label: "このデッキを削除",
                icon: "i-material-symbols:delete-outline-rounded",
                danger: true,
              },
            ]}
          />
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  </div>
);

const meta = {
  title: "UI/Menu",
  component: MenuSample,
  args: { width: "w-64" },
} satisfies Meta<typeof MenuSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 基本: Story = {};

export const 幅が狭い: Story = { args: { width: "w-48" } };
