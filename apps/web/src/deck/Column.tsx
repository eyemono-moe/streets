import { columnAlerts } from "@streets/core/deck/column-alerts";
import type { ColumnDef } from "@streets/core/deck/deck";
import { resolveSource } from "@streets/core/deck/resolve-source";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
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
import ColumnMenu, { type ColumnCommands } from "./ColumnMenu";
import { columnMeta } from "./column-meta";

export type ColumnProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
  commands: ColumnCommands;
  /** モバイルでは題名をタブが持つので、アクセント線とヘッダーを出さない。 */
  chrome?: boolean;
};

const Header: Component<{ column: ColumnDef; commands: ColumnCommands }> = (
  props,
) => {
  const meta = () => columnMeta(props.column);
  return (
    <header class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3">
      <span
        class={`c-secondary size-4.5 shrink-0 ${meta().icon}`}
        aria-hidden="true"
      />
      <div class="flex min-w-0 flex-1 flex-col">
        <h2 class="truncate font-600 text-body">{props.column.title}</h2>
        <p class="c-secondary truncate text-caption">{meta().subtitle}</p>
      </div>
      <ColumnMenu commands={props.commands} />
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
  const alerts = () =>
    columnAlerts(props.column, section.status(), props.relayList());

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  return (
    <section class="flex h-full min-h-0 w-full flex-col bg-primary">
      <Show when={props.chrome !== false}>
        <div class="h-0.75 shrink-0 bg-accent-primary" />
        <Header column={props.column} commands={props.commands} />
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
          <Match when={section.items().length > 0}>
            {/* 投稿の間の 1px を背景色で見せる。最後の投稿の下にも線を引く。 */}
            <div class="flex flex-col gap-px bg-tertiary pb-px">
              <For each={section.items()}>
                {(event) => <Event event={event} size="normal" />}
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
