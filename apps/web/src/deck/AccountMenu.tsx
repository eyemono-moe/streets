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

/**
 * 自分のアイコン。設定・Streets について・ログアウトを持つ。ログインしていなければ
 * アイコンの代わりにログインの印を出し、ステータスとログアウトの代わりにログインを置く。
 */
const AccountMenu: Component<{
  /** ログインしていなければ undefined。 */
  pubkey: string | undefined;
  onLogout: () => void;
  /** 送信先が設定されているとき、フィードバックの導線を並べる。 */
  onFeedback?: () => void;
  /** 「デッキを編集」も並べる（狭い画面で、サイドバーの代わりに）。 */
  arrange?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const statuses = useUserStatuses(() => props.pubkey ?? "");
  const current = () => statuses().find((status) => status.type === "general");
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      onSelect={(details) => {
        if (details.value === "login") dispatch({ type: "deck/login" });
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
        aria-label={props.pubkey ? "アカウント" : "ログインとメニュー"}
        class="cursor-pointer rounded-full bg-transparent"
      >
        <Show
          when={props.pubkey}
          fallback={
            <span class="c-accent-5 grid size-8 place-items-center rounded-full bg-secondary">
              <span
                class="i-material-symbols:login-rounded size-5"
                aria-hidden="true"
              />
            </span>
          }
        >
          {(pubkey) => <Avatar pubkey={pubkey()} size="compact" static />}
        </Show>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={`${menuContentClass} w-max min-w-40`}>
            <Show when={!props.pubkey}>
              <Menu.Item
                value="login"
                class={`${menuItemClass} whitespace-nowrap`}
              >
                <span
                  class="i-material-symbols:login-rounded c-secondary size-4 shrink-0"
                  aria-hidden="true"
                />
                ログイン
              </Menu.Item>
              <hr class={menuSeparatorClass} />
            </Show>
            <Show when={props.pubkey}>
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
            </Show>
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
            <Show when={props.pubkey}>
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
            </Show>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default AccountMenu;
