import { Dialog } from "@ark-ui/solid/dialog";
import { Tabs } from "@ark-ui/solid/tabs";
import { type Component, For } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { SettingsCloseIcon } from "./SettingsIcons";

export type SettingsPageDefinition = {
  value: string;
  label: string;
  content: JSX.Element;
};

type SettingsShellProps = {
  pages: readonly SettingsPageDefinition[];
  defaultPage?: string;
  onClose(): void;
};

const navigationClass =
  "c-primary w-full appearance-none rounded-2 bg-transparent px-3 py-2 text-left text-body outline-none enabled:cursor-pointer data-[selected]:bg-primary data-[selected]:font-700 enabled:hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5";

/**
 * Ark UI の Dialog/Tabs を設定 shell として一箇所に閉じる。page の content は
 * 設定 context を自分で読み、shell は設定値を知らない。
 */
const SettingsShell: Component<SettingsShellProps> = (props) => (
  <Dialog.Root
    open
    onOpenChange={(details) => {
      if (!details.open) props.onClose();
    }}
  >
    <Portal>
      <Dialog.Backdrop
        class="fixed inset-0 z-40 bg-ui-950/55"
        data-testid="settings-backdrop"
      />
      <Dialog.Positioner class="fixed inset-0 z-50 grid place-items-center p-6">
        <Dialog.Content
          class="c-primary relative h-[min(640px,calc(100dvh-48px))] w-[min(880px,calc(100vw-48px))] overflow-hidden rounded-3 border border-primary bg-primary shadow-ui/30 shadow-xl outline-none"
          data-testid="settings-dialog"
        >
          <Dialog.Title class="sr-only">設定</Dialog.Title>
          <Dialog.Description class="sr-only">
            アカウントと端末の設定を変更します。
          </Dialog.Description>
          <Tabs.Root
            class="grid h-full grid-cols-[220px_minmax(0,1fr)]"
            defaultValue={props.defaultPage ?? props.pages[0]?.value}
            orientation="vertical"
          >
            <aside class="flex min-h-0 flex-col bg-secondary px-2 py-3">
              <div class="flex h-13 items-center gap-2 px-3">
                <div class="i-streets:logo h-7 w-7" aria-hidden="true" />
                <span class="font-700 text-h3">設定</span>
              </div>
              <Tabs.List class="flex flex-col gap-1 pt-2">
                <For each={props.pages}>
                  {(page) => (
                    <Tabs.Trigger
                      class={navigationClass}
                      data-testid={`settings-tab-${page.value}`}
                      value={page.value}
                    >
                      {page.label}
                    </Tabs.Trigger>
                  )}
                </For>
              </Tabs.List>
            </aside>

            <main class="min-h-0 overflow-y-auto p-6">
              <Dialog.CloseTrigger
                aria-label="設定を閉じる"
                class="absolute top-4 right-4 grid h-9 w-9 appearance-none place-items-center rounded-full bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover"
                data-testid="settings-close"
              >
                <SettingsCloseIcon class="h-6 w-6" />
              </Dialog.CloseTrigger>

              <For each={props.pages}>
                {(page) => (
                  <Tabs.Content value={page.value}>{page.content}</Tabs.Content>
                )}
              </For>
            </main>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

export default SettingsShell;
