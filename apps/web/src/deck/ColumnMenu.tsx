import { Menu } from "@ark-ui/solid/menu";
import type { Component } from "solid-js";
import { Portal } from "solid-js/web";

export type ColumnCommands = {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
};

/**
 * カラムのヘッダーの ⋯。名前・幅・表示密度などの設定はこの後の PR で
 * ここへ足す（Penpot の `Column settings`）。
 */
const ColumnMenu: Component<{ commands: ColumnCommands; class?: string }> = (
  props,
) => (
  <Menu.Root
    onSelect={(details) => {
      if (details.value === "move-left") props.commands.onMoveLeft();
      if (details.value === "move-right") props.commands.onMoveRight();
      if (details.value === "remove") props.commands.onRemove();
    }}
  >
    <Menu.Trigger
      aria-label="このカラムの操作"
      class={`c-secondary grid shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary ${props.class ?? "size-6"}`}
    >
      <span class="i-material-symbols:more-horiz size-4.5" aria-hidden="true" />
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content class="c-primary w-56 space-y-0.5 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
          <Menu.Item
            value="move-left"
            disabled={!props.commands.canMoveLeft}
            class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body enabled:cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-50"
          >
            <span
              class="i-material-symbols:chevron-left-rounded size-4.5"
              aria-hidden="true"
            />
            左へ移動
          </Menu.Item>
          <Menu.Item
            value="move-right"
            disabled={!props.commands.canMoveRight}
            class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body enabled:cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-50"
          >
            <span
              class="i-material-symbols:chevron-right-rounded size-4.5"
              aria-hidden="true"
            />
            右へ移動
          </Menu.Item>
          <Menu.Separator class="border-primary border-t" />
          <Menu.Item
            value="remove"
            class="c-danger flex h-8.5 cursor-pointer items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
          >
            <span
              class="i-material-symbols:delete-outline-rounded size-4.5"
              aria-hidden="true"
            />
            このカラムを削除
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

export default ColumnMenu;
