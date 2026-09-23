import { Dialog } from "@ark-ui/solid/dialog";
import { type Component, Show } from "solid-js";
import { Portal } from "solid-js/web";

/** 拡張機能や署名器アプリの確認画面を見落とさないよう、待機を中央へ出す。 */
const SignerWaitOverlay: Component<{ message?: string; authUrl?: URL }> = (
  props,
) => (
  <Dialog.Root
    open={Boolean(props.message)}
    closeOnEscape={false}
    closeOnInteractOutside={false}
    lazyMount
    unmountOnExit
  >
    <Portal>
      <Dialog.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
      <Dialog.Positioner class="fixed inset-0 grid place-items-center p-4">
        <Dialog.Content class="motion-pop c-primary flex w-full max-w-sm flex-col items-center gap-3 rounded-3 border border-primary bg-primary p-6 text-center shadow-xl">
          <span
            class="i-material-symbols:progress-activity c-accent-5 size-8 animate-spin"
            aria-hidden="true"
          />
          <Dialog.Title class="font-600 text-body">
            {props.message}
          </Dialog.Title>
          <Dialog.Description class="c-secondary text-caption">
            署名器の確認画面が別のウィンドウやアプリに開いていないか確かめてください
          </Dialog.Description>
          <Show when={props.authUrl}>
            {(url) => (
              <a
                href={url().href}
                target="_blank"
                rel="noopener noreferrer"
                class="text-caption text-link"
              >
                署名器で接続を承認する
              </a>
            )}
          </Show>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

export default SignerWaitOverlay;
