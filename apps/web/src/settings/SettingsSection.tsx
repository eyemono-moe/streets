import { type JSX, type ParentComponent, Show } from "solid-js";
import IconButton from "../ui/IconButton";
import StorageHint, { type StorageScope } from "../ui/StorageHint";

/**
 * 設定の 1 項目。名前、保存先のヒント、Nostr を知らない人にも分かる説明、操作の順に並べる。
 */
const SettingsSection: ParentComponent<{
  title: string;
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
}> = (props) => (
  <section class="flex flex-col gap-2">
    <div class="flex items-center gap-1.5">
      <h3 class="c-primary font-600 text-body">{props.title}</h3>
      <Show when={props.scope}>
        {(scope) => <StorageHint scope={scope()} />}
      </Show>
      <Show when={props.changed && props.onReset}>
        {(onReset) => (
          <IconButton
            icon="i-material-symbols:refresh-rounded"
            label={`${props.title}を既定に戻す`}
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
);

export default SettingsSection;
