import { columnAlerts } from "@streets/core/deck/column-alerts";
import { type ColumnDef, columnShow } from "@streets/core/deck/deck";
import { resolveSource } from "@streets/core/deck/resolve-source";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
import { visibleColumnItems } from "@streets/core/view/column-items";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import Event from "../note/Event";
import { PALETTES, type PaletteName } from "../theme";
import ColumnSettings, { type ColumnPatch } from "./ColumnSettings";
import { columnMeta } from "./column-meta";

export type ColumnProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  onPatch: (patch: ColumnPatch) => void;
  onRemove: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  /** ヘッダーを掴んで並べ替えるための配線。 */
  onDragStart?: (event: DragEvent) => void;
  /** モバイルでは題名をタブが持つので、アクセント線とヘッダーを出さない。 */
  chrome?: boolean;
};

const Header: Component<{
  column: ColumnDef;
  open: boolean;
  onToggle: () => void;
  onDragStart?: (event: DragEvent) => void;
}> = (props) => {
  const meta = () => columnMeta(props.column);
  return (
    // ヘッダーを掴んでカラムを並べ替える。本文まで draggable にすると本文を選べなくなる。
    <header
      class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3"
      classList={{ "cursor-grab": props.onDragStart !== undefined }}
      draggable={props.onDragStart !== undefined}
      onDragStart={(event) => props.onDragStart?.(event)}
    >
      <span
        class={`c-secondary size-4.5 shrink-0 ${meta().icon}`}
        aria-hidden="true"
      />
      <div class="flex min-w-0 flex-1 flex-col">
        <h2 class="truncate font-600 text-body">{props.column.title}</h2>
        <p class="c-secondary truncate text-caption">{meta().subtitle}</p>
      </div>
      <button
        type="button"
        aria-label="カラムの設定"
        aria-expanded={props.open}
        class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        onClick={() => props.onToggle()}
      >
        <span
          class="size-4.5"
          classList={{
            "i-material-symbols:more-horiz": !props.open,
            "i-material-symbols:close-rounded": props.open,
          }}
          aria-hidden="true"
        />
      </button>
    </header>
  );
};

/** デッキの 1 列。購読はこの列が持ち、並べ方は `Event` に任せる。 */
const Column: Component<ColumnProps> = (props) => {
  const section = createSection({
    manager: props.readLayer.manager,
    // ウォームアップの結果を memo の外で読むと、settle のたびに全カラムの購読が張り直される。
    source: () =>
      resolveSource(props.column.source, {
        followees: props.followees,
        viewer: props.viewer,
        relayList: props.relayList,
        bookmarks: props.bookmarks,
      }),
  });
  const show = () => columnShow(props.column);
  const items = () => visibleColumnItems(section.items(), show());
  const alerts = () =>
    columnAlerts(props.column, section.status(), props.relayList());

  const accent = () => {
    const name = props.column.accent;
    return name && name in PALETTES
      ? PALETTES[name as PaletteName].accent
      : undefined;
  };

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  return (
    <section
      class="flex h-full min-h-0 w-full flex-col bg-primary"
      // カラムごとのアクセント色。指定が無ければアプリ全体の色のまま。
      style={accent() ? { "--theme-accent-color": accent() } : undefined}
    >
      <Show when={props.chrome !== false}>
        <div class="h-0.75 shrink-0 bg-accent-primary" />
        <Header
          column={props.column}
          open={props.settingsOpen}
          onToggle={props.onToggleSettings}
          onDragStart={props.onDragStart}
        />
      </Show>
      <Show when={props.settingsOpen}>
        <ColumnSettings
          column={props.column}
          onPatch={props.onPatch}
          onRemove={props.onRemove}
        />
      </Show>
      <For each={alerts()}>
        {(alert) => (
          <p
            role="alert"
            class="c-secondary bg-secondary px-3 py-2 text-caption"
          >
            {alert.message}
            {alert.action ? `。${alert.action}` : ""}
          </p>
        )}
      </For>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Switch>
          <Match when={items().length > 0}>
            {/* 投稿の間の 1px を背景色で見せる。最後の投稿の下にも線を引く。 */}
            <div class="flex flex-col gap-px bg-tertiary pb-px">
              <For each={items()}>
                {(event) => (
                  <Event
                    event={event}
                    size={
                      props.column.density === "compact" ? "compact" : "normal"
                    }
                    expandMedia={show().media}
                  />
                )}
              </For>
            </div>
          </Match>
          <Match when={section.status().phase === "settled"}>
            <p class="c-secondary p-4 text-caption">まだ投稿がありません。</p>
          </Match>
          <Match when={true}>
            <p class="c-secondary p-4 text-caption">読み込み中…</p>
          </Match>
        </Switch>
      </div>
    </section>
  );
};

export default Column;
