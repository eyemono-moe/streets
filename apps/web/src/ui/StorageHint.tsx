import { Tooltip } from "@ark-ui/solid/tooltip";
import { type Component, createSignal } from "solid-js";
import { t } from "../i18n/locale";
import { Portal } from "./Portal";

/** その設定をどこに保存するか。 */
export type StorageScope = "device" | "account";

const ICON: Record<StorageScope, string> = {
  device: "i-material-symbols:devices-outline-rounded",
  account: "i-material-symbols:cloud-outline",
};

/**
 * 設定の名前の横に置く、保存先のアイコン。触れるか押すと説明が出る。
 * 説明を毎回の文で出すと、設定の一覧が長くなる。
 */
const StorageHint: Component<{ scope: StorageScope }> = (props) => {
  // 触れて開くだけだと、指で使う端末では読めない。押しても開け閉めできるようにする。
  const [open, setOpen] = createSignal(false);

  return (
    <Tooltip.Root
      open={open()}
      onOpenChange={(details) => setOpen(details.open)}
      openDelay={200}
      closeOnClick={false}
      lazyMount
      unmountOnExit
    >
      <Tooltip.Trigger
        aria-label={t(`ui.storageHint.${props.scope}.label`)}
        class="c-secondary hover:c-primary grid size-5 shrink-0 cursor-help place-items-center rounded-1 bg-transparent p-0"
        onClick={(event) => {
          // スイッチの名前の中に置くと、押したときにスイッチまで切り替わる。
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span class={`${ICON[props.scope]} size-4`} aria-hidden="true" />
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="motion-pop c-primary max-w-64 rounded-2 border border-control bg-primary px-3 py-2 text-caption shadow-lg">
            {t(`ui.storageHint.${props.scope}.text`)}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
};

export default StorageHint;
