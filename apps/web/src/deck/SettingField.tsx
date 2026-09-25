import type { Component, JSX } from "solid-js";

/** カラムの設定の 1 項目。名前を上に置き、中身を下に並べる。 */
const SettingField: Component<{ label: string; children: JSX.Element }> = (
  props,
) => (
  <div class="flex w-full flex-col gap-1.5">
    <span class="c-secondary font-600 text-caption">{props.label}</span>
    {props.children}
  </div>
);

export default SettingField;
