import { Dialog } from "@kobalte/core/dialog";
import type { Accessor, Component } from "solid-js";
import Button from "../../shared/components/UI/Button";
import "../../assets/dialog.css";

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
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open) props.onClose();
    }}
  >
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 animate-duration-100 animate-fade-out bg-op-50! bg-secondary data-[expanded]:animate-duration-100 data-[expanded]:animate-fade-in" />
      <div class="fixed inset-0 grid place-items-center p-16">
        <Dialog.Content
          class="b-1 relative grid max-h-full min-h-[min(100%,18rem)] min-w-[min(100%,24rem)] animate-[contentHide] animate-duration-100 grid-rows-[auto_minmax(0,1fr)] rounded-2 bg-primary p-2 shadow-lg shadow-ui/25 data-[expanded]:animate-[contentShow] data-[expanded]:animate-duration-100"
          data-testid="settings-dialog"
        >
          <header class="flex items-center">
            <Dialog.Title class="font-500">設定</Dialog.Title>
            <Dialog.CloseButton
              class="c-secondary ml-auto appearance-none rounded-full bg-transparent p-1 enabled:hover:bg-alpha-hover enabled:hover:bg-opacity-50"
              data-testid="settings-close"
            >
              <div class="i-material-symbols:close-rounded aspect-square h-6 w-auto" />
            </Dialog.CloseButton>
          </header>

          <Dialog.Description as="div" class="overflow-auto pt-2">
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
      </div>
    </Dialog.Portal>
  </Dialog>
);

export default SettingsDialog;
