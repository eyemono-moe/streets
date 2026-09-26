import {
  type ColumnPresetKind,
  buildColumn,
  buildRelayColumn,
} from "@streets/core/deck/column-presets";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { type Component, For, Show, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import RelayColumnEditor from "./RelayColumnEditor";

type Preset = {
  kind: ColumnPresetKind | "relay";
  label: string;
  description: string;
  icon: string;
};

const PRESETS: Preset[] = [
  {
    kind: "home",
    label: "ホーム",
    description: "フォロー中のノートとリポスト",
    icon: "i-material-symbols:home-outline-rounded",
  },
  {
    kind: "notifications",
    label: "通知",
    description: "自分宛の返信・リアクション・リポスト",
    icon: "i-material-symbols:notifications-outline-rounded",
  },
  {
    kind: "relay",
    label: "リレー",
    description: "選んだリレーの公開ノート",
    icon: "i-material-symbols:globe",
  },
  {
    kind: "channels",
    label: "チャンネル",
    description: "お気に入りと最近アクティブなチャンネル",
    icon: "i-material-symbols:forum-outline-rounded",
  },
  {
    kind: "bookmarks",
    label: "ブックマーク",
    description: "保存したノート",
    icon: "i-material-symbols:bookmark-outline-rounded",
  },
];

const Row: Component<{
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    class="flex w-full cursor-pointer items-center gap-2.5 bg-primary px-3 py-2.5 text-left hover:bg-secondary"
    onClick={() => props.onClick()}
  >
    <span
      class={`c-secondary size-4.5 shrink-0 ${props.icon}`}
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-600 text-body">{props.label}</span>
      <span class="c-secondary truncate text-caption">{props.description}</span>
    </span>
    <span
      class="i-material-symbols:chevron-right-rounded c-secondary size-4.5 shrink-0"
      aria-hidden="true"
    />
  </button>
);

/** サイドバーのパネルに出す、カラムを追加するための中身。題名と閉じるはパネル側が持つ。 */
const AddColumnPanel: Component<{
  relayList: RelayListState;
  /** Storybook でリレー選択の端を並べるための初期状態。 */
  initialRelayOpen?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [relayOpen, setRelayOpen] = createSignal(
    props.initialRelayOpen ?? false,
  );
  const [selectedRelays, setSelectedRelays] = createSignal<RelayUrl[]>([]);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <Show
        when={relayOpen()}
        fallback={
          <div class="motion-fade animate-in">
            <div class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
              <For each={PRESETS}>
                {(preset) => (
                  <Row
                    icon={preset.icon}
                    label={preset.label}
                    description={preset.description}
                    onClick={() => {
                      if (preset.kind === "relay") {
                        setRelayOpen(true);
                        return;
                      }
                      const column = buildColumn(preset.kind, "");
                      if (column)
                        dispatch({ type: "deck/add-column", column: column });
                    }}
                  />
                )}
              </For>
            </div>
          </div>
        }
      >
        <section class="motion-fade flex animate-in flex-col gap-3">
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon="i-material-symbols:arrow-back-rounded"
              aria-label="カラムの種類へ戻る"
              onClick={() => setRelayOpen(false)}
            />
            <div>
              <h3 class="c-primary font-600 text-body">リレーを選ぶ</h3>
              <p class="c-secondary mt-0.5 text-caption">
                選んだリレーにある公開ノートを時系列で表示します。
              </p>
            </div>
          </div>
          <div>
            <p class="c-secondary mt-0.5 text-caption">
              URLを入力するか、アカウントで使っているリレーから追加してください。
            </p>
          </div>
          <Show when={props.relayList.phase === "loading"}>
            <p class="c-secondary text-caption">
              リレー設定を読み込んでいます…
            </p>
          </Show>
          <Show when={props.relayList.phase === "missing"}>
            <p class="c-secondary text-caption">
              アカウントのリレー設定がありません。URLを直接入力できます。
            </p>
          </Show>
          <RelayColumnEditor
            candidates={
              props.relayList.phase === "ready" ? props.relayList.entries : []
            }
            selected={selectedRelays()}
            onChange={setSelectedRelays}
          />
          <Button
            variant="primary"
            shape="rounded"
            block
            disabled={selectedRelays().length === 0}
            onClick={() => {
              const column = buildRelayColumn(selectedRelays());
              if (column) dispatch({ type: "deck/add-column", column });
            }}
          >
            リレーカラムを追加
          </Button>
        </section>
      </Show>
    </div>
  );
};

export default AddColumnPanel;
