import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Show } from "solid-js";
import RelaySummary from "../settings/RelaySummary";
import Button from "../ui/Button";
import RelayInput from "./RelayInput";
import { useFolloweeWriteRelays } from "./use-followee-relays";

/** リレーカラムの追加と設定で共用する、購読先の選択欄。 */
const RelayColumnEditor: Component<{
  candidates: readonly RelayListEntry[];
  selected: readonly RelayUrl[];
  onChange: (selected: RelayUrl[]) => void;
  minimum?: number;
  /**
   * フォローしている人ごとの、書き込みに使うリレー。渡さなければ読み取り層から引く
   * （Storybook では固定の値を渡す）。
   */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
}> = (props) => {
  const followeeRelays = useFolloweeWriteRelays();
  const selected = (url: RelayUrl) => props.selected.includes(url);
  const add = (url: RelayUrl) => {
    if (!selected(url)) props.onChange([...props.selected, url]);
  };
  const remove = (url: RelayUrl) =>
    props.onChange(props.selected.filter((item) => item !== url));

  return (
    <div class="flex flex-col gap-3">
      <Show when={props.selected.length > 0}>
        <section>
          <h4 class="c-secondary mb-1 font-600 text-caption">追加するリレー</h4>
          <ul
            class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary"
            aria-label="追加するリレー"
          >
            <For each={props.selected}>
              {(url) => (
                <li class="bg-primary">
                  <RelaySummary
                    url={url}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="rounded"
                        icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                        aria-label={`${relayLabel(url)}を追加対象から外す`}
                        disabled={props.selected.length <= (props.minimum ?? 0)}
                        title={
                          props.selected.length <= (props.minimum ?? 0)
                            ? "リレーを1つ以上選んでください"
                            : undefined
                        }
                        onClick={() => remove(url)}
                      />
                    }
                  />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
      <RelayInput
        account={props.candidates}
        followeeWriteRelays={props.followeeWriteRelays ?? followeeRelays()}
        selected={props.selected}
        onAdd={add}
      />
    </div>
  );
};

export default RelayColumnEditor;
