import { type Component, type JSX, Show } from "solid-js";
import IconButton from "../ui/IconButton";

/** カラムの設定の 1 項目。名前を上に置き、中身を下に並べる。 */
const SettingField: Component<{
  label: string;
  /**
   * 既定の値へ戻す。既定から変えてあるとき（`changed`）だけ名前の横に出す。
   * 既定がカラムの種類で違う項目に使う。
   */
  onReset?: () => void;
  changed?: boolean;
  children: JSX.Element;
}> = (props) => (
  <div class="flex w-full flex-col gap-1.5">
    <div class="flex items-center gap-1">
      <span class="c-secondary font-600 text-caption">{props.label}</span>
      <Show when={props.changed && props.onReset}>
        {(onReset) => (
          <IconButton
            size="sm"
            icon="i-material-symbols:refresh-rounded"
            label={`${props.label}を既定に戻す`}
            title="既定に戻す"
            onClick={() => onReset()()}
          />
        )}
      </Show>
    </div>
    {props.children}
  </div>
);

export default SettingField;
