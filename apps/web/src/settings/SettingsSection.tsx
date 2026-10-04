import { type JSX, type ParentComponent, Show } from "solid-js";
import IconButton from "../ui/IconButton";
import StorageHint, { type StorageScope } from "../ui/StorageHint";
import { settings, type SettingId } from "./setting-registry";
import { useSettingFilter } from "./SettingFilter";

/**
 * 設定の 1 項目。名前、保存先のヒント、Nostr を知らない人にも分かる説明、操作の順に並べる。
 */
const SettingsSection: ParentComponent<{
  /** 検索対象の設定は ID を渡す。表示名はレジストリから読む。 */
  id?: SettingId;
  /** 動的な件数を含む見出しや、Storybook の例で使う。 */
  title?: string;
  /** 保存先。保存しない項目（プレビューなど）では省く。 */
  scope?: StorageScope;
  description?: JSX.Element;
  /**
   * 既定の値へ戻す。既定から変えてあるとき（`changed`）だけ名前の横に出す。
   * 出ていること自体が「ここは変えてある」の印になる。値を 1 つ選ぶ項目に使い、
   * 一覧の項目（リレー・ミュートなど）には使わない —— 既定が「空」になり、消す操作になるため。
   */
  onReset?: () => void;
  changed?: boolean;
}> = (props) => {
  const filter = useSettingFilter();
  const selected = () => filter?.();
  const profileField = () => {
    const id = selected();
    return (
      props.id === "profile" && !!id && settings[id].id.startsWith("profile.")
    );
  };
  const title = () => {
    const id = selected();
    return profileField() && id
      ? settings[id].title
      : (props.title ?? (props.id ? settings[props.id].title : ""));
  };
  return (
    <Show when={!filter || filter() === props.id || profileField()}>
      <section class="flex flex-col gap-2">
        <div class="flex items-center gap-1.5">
          <h3 class="c-primary font-600 text-body">{title()}</h3>
          <Show when={props.scope}>
            {(scope) => <StorageHint scope={scope()} />}
          </Show>
          <Show when={props.changed && props.onReset}>
            {(onReset) => (
              <IconButton
                icon="i-material-symbols:refresh-rounded"
                label={`${title()}を既定に戻す`}
                title="既定に戻す"
                onClick={() => onReset()()}
              />
            )}
          </Show>
        </div>
        <Show when={props.description}>
          <p class="c-secondary text-caption">{props.description}</p>
        </Show>
        {props.children}
      </section>
    </Show>
  );
};

export default SettingsSection;
