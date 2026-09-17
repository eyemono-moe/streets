import { Menu } from "@ark-ui/solid/menu";
import type { Component } from "solid-js";
import { Portal } from "solid-js/web";
import Avatar from "../note/Avatar";
import { useDispatch } from "../ui-events";

/** 自分のアイコン。設定とログアウトを持つ。 */
const AccountMenu: Component<{ pubkey: string; onLogout: () => void }> = (
  props,
) => {
  const dispatch = useDispatch();
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      onSelect={(details) => {
        if (details.value === "settings")
          dispatch({ type: "deck/open-settings" });
        if (details.value === "logout") props.onLogout();
      }}
    >
      <Menu.Trigger
        aria-label="アカウント"
        class="cursor-pointer rounded-full bg-transparent"
      >
        <Avatar pubkey={props.pubkey} size="compact" static />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="motion-pop c-primary w-40 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
            <Menu.Item
              value="settings"
              class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
            >
              <span
                class="i-material-symbols:settings-outline-rounded c-secondary size-4.5"
                aria-hidden="true"
              />
              設定
            </Menu.Item>
            <Menu.Item
              value="logout"
              class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary"
            >
              <span
                class="i-material-symbols:logout-rounded c-secondary size-4.5"
                aria-hidden="true"
              />
              ログアウト
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default AccountMenu;
