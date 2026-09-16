import { Collapsible } from "@ark-ui/solid/collapsible";
import { columnAlerts } from "@streets/core/deck/column-alerts";
import { columnFacets } from "@streets/core/deck/column-facets";
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
  createSignal,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import Event from "../note/Event";
import ColumnSettings, { type ColumnPatch } from "./ColumnSettings";
import ThreadView from "./ThreadView";
import { columnMeta } from "./column-meta";
import {
  ColumnStackProvider,
  type StackEntry,
  stackKey,
  stackTitle,
} from "./column-stack";

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
  /** URL から開いたカラム。保存されていないので、残すか閉じるかを選ばせる。 */
  temporary?: { onKeep: () => void; onClose: () => void };
  /** モバイルでは題名をタブが持つので、アクセント線とヘッダーを出さない。 */
  chrome?: boolean;
};

const Header: Component<{
  column: ColumnDef;
  open: boolean;
  onToggle: () => void;
  onDragStart?: (event: DragEvent) => void;
  temporary?: { onKeep: () => void; onClose: () => void };
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
      <Show when={props.temporary}>
        {(temporary) => (
          <>
            <button
              type="button"
              class="c-secondary flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-2.5 font-600 text-caption"
              onClick={() => temporary().onKeep()}
            >
              <span
                class="i-material-symbols:bookmark-outline-rounded size-3.5"
                aria-hidden="true"
              />
              カラムに残す
            </button>
            <button
              type="button"
              aria-label="閉じる"
              class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
              onClick={() => temporary().onClose()}
            >
              <span
                class="i-material-symbols:close-rounded size-4.5"
                aria-hidden="true"
              />
            </button>
          </>
        )}
      </Show>
      <Show when={!props.temporary}>
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
      </Show>
    </header>
  );
};

/** 重ねた先のヘッダー。戻り先と、いま何段目かを出す。 */
const StackHeader: Component<{
  title: string;
  depth: number;
  backTo: string;
  onBack: () => void;
}> = (props) => (
  <header class="flex h-11.25 shrink-0 items-center gap-2.5 bg-primary px-3">
    <button
      type="button"
      aria-label="戻る"
      class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
      onClick={() => props.onBack()}
    >
      <span
        class="i-material-symbols:chevron-left-rounded size-5.5"
        aria-hidden="true"
      />
    </button>
    <div class="flex min-w-0 flex-1 flex-col">
      <h2 class="truncate font-600 text-body">{props.title}</h2>
      <p class="c-secondary truncate text-caption">{props.backTo}に戻る</p>
    </div>
    {/* 何段潜ったかを点で出す。数字より場所を取らず、戻る回数が分かる。 */}
    <div class="flex shrink-0 items-center gap-0.75" aria-hidden="true">
      <For each={Array.from({ length: props.depth + 1 })}>
        {(_, index) => (
          <span
            class="size-1.25 rounded-full"
            classList={{
              "bg-accent-primary": index() === props.depth,
              "bg-tertiary": index() !== props.depth,
            }}
          />
        )}
      </For>
    </div>
    <span class="c-secondary sr-only">{props.depth} 段目</span>
  </header>
);

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
  const facets = () => columnFacets(props.column);
  const items = () => visibleColumnItems(section.items(), show(), facets());
  const alerts = () =>
    columnAlerts(props.column, section.status(), props.relayList());
  // 重ねたもの。カラムの中だけの状態で、デッキには保存しない。
  const [stack, setStack] = createSignal<StackEntry[]>([]);
  const top = () => stack().at(-1);
  const push = (entry: StackEntry) =>
    setStack((current) => {
      const last = current.at(-1);
      return last && stackKey(last) === stackKey(entry)
        ? current
        : [...current, entry];
    });
  const back = () => setStack((current) => current.slice(0, -1));

  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );

  return (
    <ColumnStackProvider value={{ push }}>
      <section
        class="flex h-full min-h-0 w-full flex-col bg-primary"
        // 保存されていないことを枠で示す。
        classList={{
          "outline outline-2 -outline-offset-2 outline-accent-5":
            props.temporary !== undefined,
        }}
      >
        <Show when={props.chrome !== false}>
          <div class="h-0.75 shrink-0 bg-accent-primary" />
        </Show>
        <Show when={top()}>
          {(entry) => (
            <StackHeader
              title={stackTitle(entry())}
              depth={stack().length - 1}
              backTo={stack().length > 1 ? "ひとつ前" : props.column.title}
              onBack={back}
            />
          )}
        </Show>
        <Show when={props.chrome !== false && top() === undefined}>
          <Header
            column={props.column}
            open={props.settingsOpen}
            onToggle={props.onToggleSettings}
            onDragStart={props.onDragStart}
            temporary={props.temporary}
          />
        </Show>
        {/* 閉じている間は中身を作らない（lazyMount）。カラムの数だけ設定の DOM を持たないため。 */}
        <Collapsible.Root
          open={props.settingsOpen}
          lazyMount
          unmountOnExit
          class="shrink-0"
        >
          <Collapsible.Content>
            <ColumnSettings
              column={props.column}
              facets={facets()}
              onPatch={props.onPatch}
              onRemove={props.onRemove}
            />
          </Collapsible.Content>
        </Collapsible.Root>
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
        {/*
          重ねても一覧を取り外さない。取り外すとスクロール位置が失われ、
          戻ったときに読んでいた場所が分からなくなる。重ねた層は下の層を
          少しだけ覗かせて浮かせ、同じカラムの上に道が重なったように見せる。
        */}
        <div class="relative min-h-0 flex-1">
          {/* 下の層は覆って暗くする。覗いた部分が本文として読めると、重なりに見えない。 */}
          <Show when={top()}>
            <div
              class="pointer-events-none absolute inset-0 z-1 bg-ui-950/25"
              aria-hidden="true"
            />
          </Show>
          <div class="absolute inset-0 overflow-y-auto">
            <Switch>
              <Match when={items().length > 0}>
                {/* 投稿の間の 1px を背景色で見せる。最後の投稿の下にも線を引く。 */}
                <div class="flex flex-col gap-px bg-tertiary pb-px">
                  <For each={items()}>
                    {(event) => (
                      <Event
                        event={event}
                        size={
                          props.column.density === "compact"
                            ? "compact"
                            : "normal"
                        }
                        expandMedia={props.column.expandMedia !== false}
                      />
                    )}
                  </For>
                </div>
              </Match>
              <Match when={section.status().phase === "settled"}>
                <p class="c-secondary p-4 text-caption">
                  まだ投稿がありません。
                </p>
              </Match>
              <Match when={true}>
                <p class="c-secondary p-4 text-caption">読み込み中…</p>
              </Match>
            </Switch>
          </div>
          <For each={stack()}>
            {(entry, index) => (
              <div
                class="absolute inset-x-0 bottom-0 z-2 overflow-y-auto rounded-t-3 bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.28)]"
                // 段ごとに少しずつ下げて、下の層が覗くようにする（上限 3 段ぶん）。
                style={{ top: `${Math.min(index() + 1, 3) * 8}px` }}
                classList={{ hidden: index() !== stack().length - 1 }}
              >
                <Show when={entry.kind === "thread" && entry}>
                  {(thread) => (
                    <ThreadView
                      focusId={thread().focusId}
                      readLayer={props.readLayer}
                      expandMedia={props.column.expandMedia !== false}
                    />
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </ColumnStackProvider>
  );
};

export default Column;
