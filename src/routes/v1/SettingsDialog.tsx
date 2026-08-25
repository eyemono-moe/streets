import { Dialog } from "@ark-ui/solid/dialog";
import type { Accessor, Component } from "solid-js";
import { Portal } from "solid-js/web";
import Button from "../../shared/components/UI/Button";

type SettingsDialogProps = {
  developerMode: Accessor<boolean>;
  onClose(): void;
  onToggleDeveloperMode(): void;
};

/**
 * v1 の設定はデッキの文脈を失わないよう、その上に重ねて開く。
 * 現時点で実際に変更できる設定だけを置く。未実装のプロフィール・リレー・
 * ミュートを押せる項目として先に見せると、操作できるという誤った合図に
 * なるため、各スライスで経路が通った時点でここへ追加する。
 */
const SettingsDialog: Component<SettingsDialogProps> = (props) => (
  <Dialog.Root
    open
    onOpenChange={(details) => {
      if (!details.open) props.onClose();
    }}
  >
    <Portal>
      <Dialog.Backdrop class="fixed inset-0 bg-op-50! bg-secondary" />
      <Dialog.Positioner class="fixed inset-0 grid place-items-center p-16">
        <Dialog.Content
          class="b-1 relative grid max-h-full min-h-[min(100%,18rem)] min-w-[min(100%,24rem)] grid-rows-[auto_minmax(0,1fr)] rounded-2 bg-primary p-2 shadow-lg shadow-ui/25"
          data-testid="settings-dialog"
        >
          <header class="flex items-center">
            <Dialog.Title class="font-500">設定</Dialog.Title>
            <Dialog.CloseTrigger
              class="c-secondary ml-auto appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
              data-testid="settings-close"
            >
              <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
            </Dialog.CloseTrigger>
          </header>

          <Dialog.Description class="overflow-auto pt-2">
            <div class="rounded-2 border border-alpha-300 p-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 class="font-bold">開発者モード</h3>
                  <p class="mt-1 text-alpha-600 text-sm">
                    接続数や読み取り時間などの診断値をデッキに表示します。この端末だけに保存されます。
                  </p>
                </div>
                <Button
                  aria-pressed={props.developerMode()}
                  data-testid="developer-mode-toggle"
                  variant="border"
                  onClick={props.onToggleDeveloperMode}
                >
                  {props.developerMode() ? "ON" : "OFF"}
                </Button>
              </div>
            </div>
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

export default SettingsDialog;
