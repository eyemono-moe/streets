import { useNavigate, useParams } from "@solidjs/router";
import type { ColumnDef } from "@streets/core/deck/deck";
import {
  addColumnTo,
  moveColumnToIn,
  removeColumnFrom,
  updateColumnIn,
} from "@streets/core/deck/deck-mutations";
import {
  type DeckUiEvent,
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "@streets/core/deck/deck-ui";
import { TEMP_COLUMN_ID, tempColumnFor } from "@streets/core/deck/temp-column";
import { warmUpRouting } from "@streets/core/read/bootstrap";
import type { ReadLayer } from "@streets/core/read/read-layer";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { EventActionsProvider, createWriteStack } from "../actions";
import { ActionsMediator } from "../actions-mediator";
import { setDiagnostics } from "../devtools/diagnostics";
import ComposePanel from "../note/ComposePanel";
import type { Session } from "../session";
import { Mediates, type UiEvent } from "../ui-events";
import AddColumnPanel from "./AddColumnPanel";
import Column from "./Column";
import DeckSyncNotice from "./DeckSyncNotice";
import { ComposeFab, Sidebar, TabBar } from "./Nav";
import SidePanel from "./SidePanel";
import { columnMeta } from "./column-meta";
import { createDeckStore } from "./deck-store";
import { relayListState } from "./relay-list";

/** カラムを横に並べられる幅かどうか。狭い端末ではタブで 1 列ずつ見せる。 */
const useIsWide = () => {
  const query = matchMedia("(min-width: 768px)");
  const [wide, setWide] = createSignal(query.matches);
  const sync = () => setWide(query.matches);
  query.addEventListener("change", sync);
  onCleanup(() => query.removeEventListener("change", sync));
  return wide;
};

const DeckScreen: Component<{ readLayer: ReadLayer; session: Session }> = (
  props,
) => {
  // App が pubkey ごとに作り直すので、この画面の間 viewer は変わらない。
  // biome-ignore lint/style/noNonNullAssertion: ログイン中にしか描かれない
  const viewer = props.session.pubkey()!;
  const write = createWriteStack({
    readLayer: props.readLayer,
    signer: props.session.signer,
    viewer,
  });
  const isWide = useIsWide();
  // 保存しない画面の状態。遷移は core の純粋関数で、ここは結果を store へ当てるだけ。
  const [ui, setUi] = createStore<DeckUiState>(emptyDeckUi());
  const applyUi = (event: DeckUiEvent) =>
    setUi(reconcile(deckUiTransition(unwrap(ui), event)));
  let columnsEl: HTMLDivElement | undefined;
  // 足したカラムは右端に生える。そのままだと気づけないので端まで送る。
  const scrollToEnd = () =>
    requestAnimationFrame(() =>
      columnsEl?.scrollTo({ left: columnsEl.scrollWidth, behavior: "smooth" }),
    );

  const [warmUp] = createResource(props.session.pubkey, async (pubkey) => {
    // 水和を待たずに始めると、空のストアを「キャッシュ無し」と見なして全員分を取り直す。
    await props.readLayer.ready;
    const startedAt = performance.now();
    const result = await warmUpRouting({
      pubkey,
      store: props.readLayer.store,
      pool: props.readLayer.manager.pool,
    });
    setDiagnostics("warmUp", {
      ...result,
      totalMs: performance.now() - startedAt,
    });
    return result;
  });
  const settled = () => warmUp.state === "ready" || warmUp.state === "errored";
  // フォローした結果をその場でタイムラインへ反映する。kind:3 がまだ無い間は、
  // ウォームアップが読んだ値で待つ（0 人で購読し直さない）。
  const followees = () => {
    const live = write.actions.followeeIds();
    return live.length > 0 ? live : (warmUp()?.followees ?? []);
  };
  const relayList = () =>
    relayListState(props.readLayer.store, viewer, settled());

  const deckStore = createDeckStore({
    pubkey: props.session.pubkey,
    // ルーティングが決まる前に置換すると、自分の write リレーが分からないまま送ることになる。
    routingSettled: settled,
    signer: props.session.signer,
    writer: write.writer,
    fetchLatest: write.fetchLatest,
    storage: localStorage,
  });
  const columns = () => deckStore.value()?.columns ?? [];

  // URL の 1 区画から開く一時カラム。デッキへは保存せず、左端に出す（ADR-0032）。
  const params = useParams<{ entity?: string }>();
  const navigate = useNavigate();
  const temp = () => (params.entity ? tempColumnFor(params.entity) : undefined);

  // 並んでいるカラムが変わったら、選んでいるタブを合わせる（消えたカラムを選んだままにしない）。
  createEffect(() =>
    applyUi({
      type: "deck/columns-changed",
      ids: columns().map((column) => column.id),
      temp: temp() ? TEMP_COLUMN_ID : undefined,
    }),
  );

  // 足したカラムは右端に生える。そのままだと気づけないので端まで送る。
  const addColumn = (column: ColumnDef) => {
    // 重ねた段の id は中身から作ってあり（`thread:…`）、同じものを 2 回足すと衝突する。
    const added = { ...column, id: crypto.randomUUID() };
    deckStore.update((deck) => addColumnTo(deck, added));
    applyUi({ type: "deck/column-added", id: added.id });
    scrollToEnd();
  };

  // デッキの段の Mediator。カラムの段が裁定しなかったイベントがここへ上がってくる。
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "deck/open-panel":
      case "deck/close-panel":
      case "deck/select-column":
      case "deck/toggle-settings":
      case "deck/drag-start":
      case "deck/drag-end":
        applyUi(event);
        return true;
      case "deck/drop": {
        const id = ui.dragging;
        applyUi({ type: "deck/drag-end" });
        if (!id || id === event.targetId) return true;
        const to = columns().findIndex(
          (column) => column.id === event.targetId,
        );
        if (to >= 0) deckStore.update((deck) => moveColumnToIn(deck, id, to));
        return true;
      }
      case "deck/add-column":
        addColumn(event.column);
        return true;
      case "deck/patch-column":
        deckStore.update((deck) => updateColumnIn(deck, event.id, event.patch));
        return true;
      case "deck/remove-column":
        deckStore.update((deck) => removeColumnFrom(deck, event.id));
        applyUi({ type: "deck/column-removed", id: event.id });
        return true;
      case "deck/keep-temp": {
        const column = temp();
        navigate("/");
        if (column) addColumn(column);
        return true;
      }
      case "deck/close-temp":
        navigate("/");
        return true;
      default:
        return false;
    }
  };

  const panelView = (full: boolean) => (
    <Show when={ui.panel}>
      {(current) => (
        <Show
          when={current() === "compose"}
          fallback={
            <SidePanel
              title="カラムを追加"
              icon="i-material-symbols:add-rounded"
              full={full}
            >
              <AddColumnPanel />
            </SidePanel>
          }
        >
          <SidePanel
            title="ノートを書く"
            icon="i-material-symbols:edit-square-outline-rounded"
            full={full}
          >
            <ComposePanel
              onPosted={() => handle({ type: "deck/close-panel" })}
            />
          </SidePanel>
        </Show>
      )}
    </Show>
  );

  const shared = {
    get readLayer() {
      return props.readLayer;
    },
    viewer,
    followees,
    relayList,
    bookmarks: write.actions.bookmarkIds,
  };

  return (
    <EventActionsProvider value={write.actions}>
      {/* デッキが裁定しなかった単発の操作（いいね・フォローなど）は、その外側が受ける。 */}
      <ActionsMediator actions={write.actions}>
        <Mediates handle={handle}>
          <Switch>
            <Match when={warmUp.error}>
              <p role="alert" class="c-danger p-4 text-caption">
                フォローリストを取得できませんでした。
              </p>
            </Match>
            <Match when={deckStore.value() === undefined}>
              <p class="c-secondary p-4 text-caption">デッキを読み込み中…</p>
            </Match>
            <Match when={isWide()}>
              <div class="flex h-dvh">
                <Sidebar pubkey={viewer} onLogout={props.session.logout} />
                {panelView(false)}
                <div class="flex min-w-0 flex-1 flex-col">
                  <DeckSyncNotice store={deckStore} />
                  {/* カラムの間の 1px を背景色で見せる。横に溢れたら横スクロールする。 */}
                  <div
                    ref={columnsEl}
                    class="flex min-h-0 flex-1 gap-px overflow-x-auto bg-tertiary"
                  >
                    <Show when={temp()}>
                      {(column) => (
                        <div class="h-full w-95 shrink-0">
                          <Column
                            column={column()}
                            settingsOpen={false}
                            temporary
                            {...shared}
                          />
                        </div>
                      )}
                    </Show>
                    <Show when={params.entity && !temp()}>
                      <div class="h-full w-95 shrink-0 bg-primary p-4">
                        <p role="alert" class="c-secondary text-caption">
                          このリンクは読めませんでした：{params.entity}
                        </p>
                      </div>
                    </Show>
                    <For each={columns()}>
                      {(column) => (
                        <div
                          class="h-full shrink-0"
                          classList={{
                            "w-80": column.width === "s",
                            "w-95":
                              column.width !== "s" && column.width !== "l",
                            "w-110": column.width === "l",
                            "opacity-50": ui.dragging === column.id,
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            handle({ type: "deck/drop", targetId: column.id });
                          }}
                        >
                          <Column
                            column={column}
                            settingsOpen={ui.settingsFor === column.id}
                            draggable
                            {...shared}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </Match>
            <Match when={true}>
              <div class="relative flex h-dvh flex-col">
                <div class="h-0.75 shrink-0 bg-accent-primary" />
                <div class="flex shrink-0 items-center gap-1 overflow-x-auto bg-primary px-2">
                  <Show when={temp()}>
                    {(column) => (
                      <button
                        type="button"
                        class="flex h-11 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 bg-transparent px-3 text-body"
                        classList={{
                          "c-primary font-600": ui.active === "temp",
                          "c-secondary": ui.active !== "temp",
                        }}
                        onClick={() =>
                          handle({
                            type: "deck/select-column",
                            id: TEMP_COLUMN_ID,
                          })
                        }
                      >
                        <span class="flex items-center gap-1.5">
                          <span
                            class={`size-4 ${columnMeta(column()).icon}`}
                            aria-hidden="true"
                          />
                          {column().title}
                        </span>
                        <span
                          class="h-0.5 w-6 rounded-full"
                          classList={{
                            "bg-accent-primary": ui.active === "temp",
                          }}
                        />
                      </button>
                    )}
                  </Show>
                  <For each={columns()}>
                    {(column) => (
                      <button
                        type="button"
                        class="flex h-11 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 bg-transparent px-3 text-body"
                        classList={{
                          "c-primary font-600":
                            ui.panel === undefined && ui.active === column.id,
                          "c-secondary":
                            ui.panel !== undefined || ui.active !== column.id,
                        }}
                        onClick={() =>
                          handle({ type: "deck/select-column", id: column.id })
                        }
                      >
                        <span class="flex items-center gap-1.5">
                          <span
                            class={`size-4 ${columnMeta(column).icon}`}
                            aria-hidden="true"
                          />
                          {column.title}
                        </span>
                        <span
                          class="h-0.5 w-6 rounded-full"
                          classList={{
                            "bg-accent-primary":
                              ui.panel === undefined && ui.active === column.id,
                          }}
                        />
                      </button>
                    )}
                  </For>
                  <button
                    type="button"
                    aria-label="カラムを追加"
                    class="c-secondary grid size-8 shrink-0 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
                    onClick={() =>
                      handle({ type: "deck/open-panel", panel: "add-column" })
                    }
                  >
                    <span
                      class="i-material-symbols:add-rounded size-4.5"
                      aria-hidden="true"
                    />
                  </button>
                  <Show
                    when={columns().find((column) => column.id === ui.active)}
                  >
                    {(column) => (
                      <button
                        type="button"
                        aria-label="カラムの設定"
                        aria-expanded={ui.settingsFor === column().id}
                        class="c-secondary grid size-8 shrink-0 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
                        onClick={() =>
                          handle({
                            type: "deck/toggle-settings",
                            id: column().id,
                          })
                        }
                      >
                        <span
                          class="i-material-symbols:more-horiz size-4.5"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </Show>
                </div>
                <DeckSyncNotice store={deckStore} />
                {/*
              隠れたカラムも描いたままにする。取り外すと購読ごと消え、
              タブを戻すたびに取得し直しになり、スクロール位置も失われる。
            */}
                <div class="min-h-0 flex-1">
                  <Show when={temp()}>
                    {(column) => (
                      <div
                        class="h-full"
                        classList={{
                          hidden:
                            ui.panel !== undefined || ui.active !== "temp",
                        }}
                      >
                        <Column
                          column={column()}
                          settingsOpen={false}
                          temporary
                          {...shared}
                        />
                      </div>
                    )}
                  </Show>
                  <For each={columns()}>
                    {(column) => (
                      <div
                        class="h-full"
                        classList={{
                          hidden:
                            ui.panel !== undefined || ui.active !== column.id,
                        }}
                      >
                        <Column
                          column={column}
                          settingsOpen={ui.settingsFor === column.id}
                          chrome={false}
                          {...shared}
                        />
                      </div>
                    )}
                  </For>
                  {panelView(true)}
                </div>
                {/* パネルを開いている間は、送信ボタンと重なるので出さない。 */}
                <Show when={ui.panel === undefined}>
                  <ComposeFab />
                </Show>
                <TabBar pubkey={viewer} onLogout={props.session.logout} />
              </div>
            </Match>
          </Switch>
        </Mediates>
      </ActionsMediator>
    </EventActionsProvider>
  );
};

export default DeckScreen;
