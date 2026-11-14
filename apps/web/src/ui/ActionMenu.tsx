import { Drawer } from "@ark-ui/solid/drawer";
import { Menu } from "@ark-ui/solid/menu";
import { type Component, For, Show, createSignal } from "solid-js";
import { canHover } from "../can-hover";
import IconButton from "./IconButton";
import {
  itemMenuPositioning,
  menuContentClass,
  menuIconClass,
  menuItemClass,
  sheetContentClass,
  sheetIconClass,
  sheetItemClass,
} from "./menu";
import { Portal } from "./Portal";

export type ActionMenuItem = {
  value: string;
  label: string;
  icon: string;
  /** 消す・外すなど、取り消しにくい操作。 */
  danger?: boolean;
};

/**
 * 一覧の行の ⋯ から開く操作の一覧。カーソルを当てられる端末ではポップアップで、
 * 触る端末では下から出すシートで出す（投稿のメニューと同じ）。
 */
const ActionMenu: Component<{
  /** ⋯ の読み上げの名前（「○○ の操作」）。 */
  label: string;
  items: readonly ActionMenuItem[];
  onSelect: (value: string) => void;
  /** 触る端末の形で出すか。既定は、カーソルを当てられない端末。Storybook 用。 */
  sheet?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  // シートが閉じきってから行う。閉じる動きの間はフォーカスの囲いが残り、開いた先
  // （ダイアログなど）からフォーカスを奪い返す。
  let picked: string | undefined;
  const trigger = (triggerProps: () => object) => (
    <IconButton
      {...triggerProps()}
      icon="i-material-symbols:more-vert"
      label={props.label}
    />
  );
  return (
    <Show
      when={props.sheet ?? !canHover()}
      fallback={
        <Menu.Root
          lazyMount
          unmountOnExit
          positioning={itemMenuPositioning}
          onSelect={(details) => props.onSelect(details.value)}
        >
          <Menu.Trigger asChild={trigger} />
          <Portal>
            <Menu.Positioner>
              <Menu.Content class={`${menuContentClass} w-72`}>
                <For each={props.items}>
                  {(item) => (
                    <Menu.Item
                      value={item.value}
                      class={menuItemClass}
                      classList={{ "c-danger": item.danger }}
                    >
                      <span
                        class={`${item.icon} ${menuIconClass}`}
                        aria-hidden="true"
                      />
                      <span class="truncate">{item.label}</span>
                    </Menu.Item>
                  )}
                </For>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      }
    >
      <Drawer.Root
        lazyMount
        unmountOnExit
        open={open()}
        onOpenChange={(details) => setOpen(details.open)}
        onExitComplete={() => {
          const value = picked;
          picked = undefined;
          if (value !== undefined) props.onSelect(value);
        }}
        swipeDirection="down"
      >
        <Drawer.Trigger asChild={trigger} />
        <Portal>
          <Drawer.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
          <Drawer.Positioner class="fixed inset-0">
            <Drawer.Content class={sheetContentClass}>
              <Drawer.Grabber class="flex shrink-0 justify-center py-2">
                <Drawer.GrabberIndicator class="h-1 w-10 rounded-full bg-ui-4" />
              </Drawer.Grabber>
              <Drawer.Title class="sr-only">{props.label}</Drawer.Title>
              <div class="min-h-0 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <For each={props.items}>
                  {(item) => (
                    <button
                      type="button"
                      class={sheetItemClass}
                      classList={{
                        "c-danger": item.danger,
                        "c-primary": !item.danger,
                      }}
                      onClick={() => {
                        picked = item.value;
                        setOpen(false);
                      }}
                    >
                      <span
                        class={`${item.icon} ${sheetIconClass}`}
                        aria-hidden="true"
                      />
                      <span class="truncate">{item.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </Show>
  );
};

export default ActionMenu;
