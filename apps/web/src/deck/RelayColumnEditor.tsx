import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Show } from "solid-js";
import RelaySummary from "../settings/RelaySummary";
import IconButton from "../ui/IconButton";
import RelayInput from "./RelayInput";

/** 選んだリレーの一覧と、補完付きでリレーを足す欄。リレーカラム・チャンネル・送り直しで共用する。 */
const RelayColumnEditor: Component<{
  candidates: readonly RelayListEntry[];
  selected: readonly RelayUrl[];
  onChange: (selected: RelayUrl[]) => void;
  minimum?: number;
  /** フォローしている人ごとの、書き込みに使うリレー。渡さなければ読み取り層から引く。 */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
  /** 選んだリレーの一覧の見出し。 */
  listLabel?: string;
}> = (props) => {
  const listLabel = () => props.listLabel ?? "追加するリレー";
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
          <h4 class="c-secondary mb-1 font-600 text-caption">{listLabel()}</h4>
          <ul
            class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary"
            aria-label={listLabel()}
          >
            <For each={props.selected}>
              {(url) => (
                <li class="bg-primary">
                  <RelaySummary
                    url={url}
                    actions={
                      <IconButton
                        icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                        label={`${relayLabel(url)}を${listLabel()}から外す`}
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
        followeeWriteRelays={props.followeeWriteRelays}
        selected={props.selected}
        onAdd={add}
      />
    </div>
  );
};

export default RelayColumnEditor;
