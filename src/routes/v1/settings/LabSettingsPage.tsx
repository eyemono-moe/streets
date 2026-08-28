import type { Component } from "solid-js";
import Button from "../../../shared/components/UI/Button";
import { useDeviceSettings } from "../device-settings";
import SettingsPage from "./SettingsPage";

const LabSettingsPage: Component = () => {
  const device = useDeviceSettings();
  return (
    <SettingsPage
      title="ラボ"
      description="この端末だけに保存する実験的な設定です。"
    >
      <div class="mt-5 flex min-h-13 items-center justify-between gap-3 rounded-2 border border-primary px-3 py-2">
        <div>
          <h3 class="font-700 text-body">開発者モード</h3>
          <p class="c-secondary mt-1 text-caption">
            接続数や読み取り時間などの診断値をデッキに表示します。
          </p>
        </div>
        <Button
          aria-pressed={device.developerMode()}
          data-testid="developer-mode-toggle"
          variant="border"
          onClick={device.toggleDeveloperMode}
        >
          {device.developerMode() ? "ON" : "OFF"}
        </Button>
      </div>
    </SettingsPage>
  );
};

export default LabSettingsPage;
