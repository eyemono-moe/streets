import {
  type ColumnPresetKind,
  buildColumn,
} from "@streets/core/deck/column-presets";
import type { ColumnDef } from "@streets/core/deck/deck";
import { decodeNpub } from "@streets/core/nostr/nip19";
import { type Component, For, Show, createSignal } from "solid-js";

type Preset = {
  kind: ColumnPresetKind;
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
    kind: "global",
    label: "グローバル",
    description: "指定したリレーの全体",
    icon: "i-material-symbols:globe",
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

/** デッキの末尾に出る、カラムを追加するための列。 */
const AddColumnPanel: Component<{
  onAdd: (column: ColumnDef) => void;
  onClose: () => void;
}> = (props) => {
  const [query, setQuery] = createSignal("");
  const trimmed = () => query().trim();
  // npub / nprofile ならユーザー、それ以外はハッシュタグとして扱う。
  const searchKind = (): ColumnPresetKind =>
    decodeNpub(trimmed()) ? "user" : "hashtag";
  const searchColumn = () =>
    trimmed().length > 0 ? buildColumn(searchKind(), trimmed()) : undefined;

  return (
    <section class="flex h-full min-h-0 w-full flex-col bg-primary">
      <div class="h-0.75 shrink-0 bg-accent-primary" />
      <header class="flex h-11.25 shrink-0 items-center gap-2.5 px-3">
        <span
          class="i-material-symbols:add-rounded c-secondary size-4.5 shrink-0"
          aria-hidden="true"
        />
        <h2 class="min-w-0 flex-1 truncate font-600 text-body">カラムを追加</h2>
        <button
          type="button"
          aria-label="閉じる"
          class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
          onClick={() => props.onClose()}
        >
          <span
            class="i-material-symbols:close-rounded size-4.5"
            aria-hidden="true"
          />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <form
          class="flex h-10 items-center gap-2 rounded-full border border-primary px-3"
          onSubmit={(event) => {
            event.preventDefault();
            const column = searchColumn();
            if (column) props.onAdd(column);
          }}
        >
          <span
            class="i-material-symbols:search-rounded c-secondary size-4.5 shrink-0"
            aria-hidden="true"
          />
          <input
            class="c-primary placeholder:c-secondary min-w-0 flex-1 bg-transparent text-body outline-none"
            placeholder="ユーザー・ハッシュタグ・npub で検索"
            aria-label="追加するカラムを検索"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </form>

        <Show when={searchColumn()}>
          {(column) => (
            <div class="mt-2 overflow-hidden rounded-2 border border-primary">
              <Row
                icon={
                  searchKind() === "user"
                    ? "i-material-symbols:person-outline-rounded"
                    : "i-material-symbols:tag-rounded"
                }
                label={column().title}
                description={
                  searchKind() === "user" ? "ノートと返信" : "ハッシュタグ"
                }
                onClick={() => props.onAdd(column())}
              />
            </div>
          )}
        </Show>

        <h3 class="c-secondary mt-4 mb-1 font-600 text-caption">プリセット</h3>
        <div class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={PRESETS}>
            {(preset) => (
              <Row
                icon={preset.icon}
                label={preset.label}
                description={preset.description}
                onClick={() => {
                  const column = buildColumn(preset.kind, "");
                  if (column) props.onAdd(column);
                }}
              />
            )}
          </For>
        </div>
      </div>
    </section>
  );
};

export default AddColumnPanel;
