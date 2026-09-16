import { Menu } from "@ark-ui/solid/menu";
import type { Component } from "solid-js";
import { Portal } from "solid-js/web";
import Avatar from "../note/Avatar";

/** 自分のアイコン。今はログアウトだけを持つ（設定は画面 8）。 */
const AccountMenu: Component<{ pubkey: string; onLogout: () => void }> = (
  props,
) => (
  <Menu.Root
    onSelect={(details) => {
      if (details.value === "logout") props.onLogout();
    }}
  >
    <Menu.Trigger
      aria-label="アカウント"
      class="cursor-pointer rounded-full bg-transparent"
    >
      <Avatar pubkey={props.pubkey} size="compact" />
    </Menu.Trigger>
    <Portal>
      <Menu.Positioner>
        <Menu.Content class="c-primary w-40 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
          <Menu.Item
            value="logout"
            class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
          >
            ログアウト
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu.Root>
);

export default AccountMenu;
