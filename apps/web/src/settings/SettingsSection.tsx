import { type JSX, type ParentComponent, Show } from "solid-js";
import StorageHint, { type StorageScope } from "../ui/StorageHint";

/**
 * 設定の 1 項目。名前、保存先のヒント、Nostr を知らない人にも分かる説明、操作の順に並べる。
 */
const SettingsSection: ParentComponent<{
  title: string;
  /** 保存先。保存しない項目（プレビューなど）では省く。 */
  scope?: StorageScope;
  description?: JSX.Element;
}> = (props) => (
  <section class="flex flex-col gap-2">
    <div class="flex items-center gap-1.5">
      <h3 class="c-primary font-600 text-body">{props.title}</h3>
      <Show when={props.scope}>
        {(scope) => <StorageHint scope={scope()} />}
      </Show>
    </div>
    <Show when={props.description}>
      <p class="c-secondary text-caption">{props.description}</p>
    </Show>
    {props.children}
  </section>
);

export default SettingsSection;
