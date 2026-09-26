import {
  type ColumnPresetKind,
  buildColumn,
  buildRelayColumn,
} from "@streets/core/deck/column-presets";
import type { ColumnDef } from "@streets/core/deck/deck";
import { CHANNEL_CREATE_KIND } from "@streets/core/nostr/channel";
import { encodeNevent } from "@streets/core/nostr/nip19";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { type Component, For, Show, createSignal } from "solid-js";
import ChannelList from "../columns/blocks/ChannelList";
import { ColumnScope } from "../columns/column-scope";
import { viewerReadRelays } from "../columns/column-views";
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
/**
 * チャンネルを選ぶ。押したチャンネルはそのままデッキに足し、「覗く」はデッキに
 * 足さずに一時カラムで開く。一覧そのものをカラムとして置くこともできる。
 */
const ChannelPicker: Component<{
  relayList: RelayListState;
  readLayer?: ReadLayer;
  onBack: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section class="motion-fade flex animate-in flex-col gap-3">
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon="i-material-symbols:arrow-back-rounded"
          aria-label="カラムの種類へ戻る"
          onClick={() => props.onBack()}
        />
        <div>
          <h3 class="c-primary font-600 text-body">チャンネルを選ぶ</h3>
          <p class="c-secondary mt-0.5 text-caption">
            選んだチャンネルをカラムとして足します。
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        shape="rounded"
        block
        icon="i-material-symbols:forum-outline-rounded"
        onClick={() => {
          const column = buildColumn("channels", "");
          if (column) dispatch({ type: "deck/add-column", column });
        }}
      >
        一覧をカラムとして足す
      </Button>
      <Show when={props.readLayer}>
        {(layer) => (
          <div class="-mx-3">
            <ColumnScope
              value={{
                column: () => PICKER_COLUMN,
                readLayer: layer(),
              }}
            >
              <ChannelList
                viewerRead={() => viewerReadRelays(props.relayList)}
                onOpen={(column) =>
                  dispatch({
                    type: "deck/add-column",
                    // デッキでは同じチャンネルを 2 本置けるよう、id は足すたびに振る。
                    column: { ...column, id: crypto.randomUUID() },
                  })
                }
                onPeek={(entry, relays) => {
                  const nevent = encodeNevent({
                    id: entry.channel.id,
                    relays: relays.slice(0, 2),
                    eventKind: CHANNEL_CREATE_KIND,
                  });
                  if (nevent)
                    dispatch({ type: "deck/open-temp", entity: nevent });
                }}
              />
            </ColumnScope>
          </div>
        )}
      </Show>
    </section>
  );
};

/** パネルの中の一覧は、デッキのカラムではない。診断値の名前と見せ方の既定にだけ使う。 */
const PICKER_COLUMN: ColumnDef = {
  id: "add-column/channels",
  title: "チャンネル",
  source: { kind: "channel-list" },
};

const AddColumnPanel: Component<{
  relayList: RelayListState;
  /** Storybook でリレー選択の端を並べるための初期状態。 */
  initialRelayOpen?: boolean;
  /** Storybook でチャンネル選択を開いた状態から始めるため。 */
  initialChannelOpen?: boolean;
  /** チャンネルを選ぶ一覧が読む。Storybook では渡さない（一覧の見た目は別のストーリーで見る）。 */
  readLayer?: ReadLayer;
}> = (props) => {
  const dispatch = useDispatch();
  const [relayOpen, setRelayOpen] = createSignal(
    props.initialRelayOpen ?? false,
  );
  const [channelOpen, setChannelOpen] = createSignal(
    props.initialChannelOpen ?? false,
  );
  const [selectedRelays, setSelectedRelays] = createSignal<RelayUrl[]>([]);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <Show
        when={!channelOpen()}
        fallback={
          <ChannelPicker
            relayList={props.relayList}
            readLayer={props.readLayer}
            onBack={() => setChannelOpen(false)}
          />
        }
      >
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
                        if (preset.kind === "channels") {
                          setChannelOpen(true);
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
      </Show>
    </div>
  );
};

export default AddColumnPanel;
