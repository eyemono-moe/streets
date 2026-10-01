import { Menu } from "@ark-ui/solid/menu";
import { type Component, Show } from "solid-js";
import { Portal } from "solid-js/web";
import Avatar from "../note/Avatar";
import { useUserStatuses } from "../status/use-user-statuses";
import { tourTarget } from "../tour/tour-target";
import { useDispatch } from "../ui-events";
import {
  menuContentClass,
  menuItemClass,
  menuSeparatorClass,
} from "../ui/menu";

/** 自分のアイコン。設定・Streets について・ログアウトを持つ。 */
const AccountMenu: Component<{
  pubkey: string;
  onLogout: () => void;
  /** フィードバックも並べる（狭い画面で、下のバーに置き場所が無いため）。 */
  onFeedback?: () => void;
  /** 「デッキを編集」も並べる（狭い画面で、サイドバーの代わりに）。 */
  arrange?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const statuses = useUserStatuses(() => props.pubkey);
  const current = () => statuses().find((status) => status.type === "general");
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      onSelect={(details) => {
        if (details.value === "status") dispatch({ type: "status/edit" });
        if (details.value === "settings")
          dispatch({ type: "deck/open-settings" });
        if (details.value === "about") dispatch({ type: "deck/open-about" });
        if (details.value === "arrange")
          dispatch({ type: "deck/open-panel", panel: "arrange" });
        if (details.value === "feedback") props.onFeedback?.();
        if (details.value === "logout") props.onLogout();
      }}
    >
      <Menu.Trigger
        {...tourTarget("account")}
        aria-label="アカウント"
        class="cursor-pointer rounded-full bg-transparent"
      >
        <Avatar pubkey={props.pubkey} size="compact" static />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={`${menuContentClass} w-max min-w-40`}>
            <Menu.Item value="status" class={`${menuItemClass} max-w-72`}>
              <span
                class="i-material-symbols:add-reaction-outline-rounded c-secondary size-4 shrink-0"
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-col">
                <span class="whitespace-nowrap">ステータスを設定</span>
                {/* 今の状態を添える。切れても、何を出しているかは分かる。 */}
                <Show when={current()}>
                  {(status) => (
                    <span class="c-secondary truncate text-caption">
                      {status().content}
                    </span>
                  )}
                </Show>
              </span>
            </Menu.Item>
            <hr class={menuSeparatorClass} />
            <Menu.Item
              value="settings"
              class={`${menuItemClass} whitespace-nowrap`}
            >
              <span
                class="i-material-symbols:settings-outline-rounded c-secondary size-4 shrink-0"
                aria-hidden="true"
              />
              設定
            </Menu.Item>
            <Menu.Item
              value="about"
              class={`${menuItemClass} whitespace-nowrap`}
            >
              <span
                class="i-material-symbols:info-outline-rounded c-secondary size-4 shrink-0"
                aria-hidden="true"
              />
              Streets について
            </Menu.Item>
            <Show when={props.arrange}>
              <Menu.Item
                value="arrange"
                class={`${menuItemClass} whitespace-nowrap`}
              >
                <span
                  class="i-material-symbols:view-column-outline-rounded c-secondary size-4 shrink-0"
                  aria-hidden="true"
                />
                デッキを編集
              </Menu.Item>
            </Show>
            <Show when={props.onFeedback}>
              <Menu.Item
                value="feedback"
                class={`${menuItemClass} whitespace-nowrap`}
              >
                <span
                  class="i-material-symbols:feedback-outline-rounded c-secondary size-4 shrink-0"
                  aria-hidden="true"
                />
                フィードバックを送る
              </Menu.Item>
            </Show>
            <Menu.Item
              value="logout"
              class={`${menuItemClass} whitespace-nowrap`}
            >
              <span
                class="i-material-symbols:logout-rounded c-secondary size-4 shrink-0"
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
