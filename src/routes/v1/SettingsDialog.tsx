import type { Accessor, Component } from "solid-js";
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
  <dialog
    aria-labelledby="v1-settings-title"
    aria-modal="true"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
    data-testid="settings-dialog"
    open
  >
    <section class="max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-2xl overflow-y-auto rounded-3 border border-alpha-300 bg-base p-4 shadow-xl">
      <header class="mb-4 flex items-center justify-between gap-3">
        <h2 class="font-bold text-lg" id="v1-settings-title">
          設定
        </h2>
        <Button
          data-testid="settings-close"
          variant="border"
          onClick={props.onClose}
        >
          閉じる
        </Button>
      </header>

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
    </section>
  </dialog>
);

export default SettingsDialog;
