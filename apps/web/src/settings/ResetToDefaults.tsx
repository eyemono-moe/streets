import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import SettingsSection from "./SettingsSection";

/**
 * そのページの、この端末に保存した設定をはじめの状態に戻す。アクション欄の
 * 並びのように作り直すのが手間なものも消えるので、押したらひと呼吸置いて確かめる。
 */
const ResetToDefaults: Component<{
  /** 何を戻すか。確かめるときにそのまま出す。 */
  description: string;
  /** すでに既定のままなら押せない。 */
  isDefault: boolean;
  onReset: () => void;
  /** ストーリーで確かめている途中を見せるため。アプリでは渡さない。 */
  initialConfirming?: boolean;
}> = (props) => {
  const [confirming, setConfirming] = createSignal(
    props.initialConfirming ?? false,
  );
  return (
    <SettingsSection
      title="既定に戻す"
      scope="device"
      description={props.description}
    >
      <Show
        when={confirming()}
        fallback={
          <div>
            <Button
              icon="i-material-symbols:refresh-rounded"
              disabled={props.isDefault}
              onClick={() => setConfirming(true)}
            >
              既定に戻す
            </Button>
          </div>
        }
      >
        <div class="motion-fade flex animate-in flex-col gap-2 rounded-2 border border-primary p-3">
          <p class="text-caption">いまの設定は残りません。戻しますか？</p>
          <div class="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              やめる
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="i-material-symbols:refresh-rounded"
              onClick={() => {
                setConfirming(false);
                props.onReset();
              }}
            >
              戻す
            </Button>
          </div>
        </div>
      </Show>
    </SettingsSection>
  );
};

export default ResetToDefaults;
