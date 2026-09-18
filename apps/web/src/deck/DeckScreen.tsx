import { useNavigate, useParams } from "@solidjs/router";
import type { ColumnDef, DeckAppearance } from "@streets/core/deck/deck";
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
import { ComposeMediator } from "../note/ComposeMediator";
import ComposePanel from "../note/ComposePanel";
import type { Session } from "../session";
import { MuteMediator } from "../settings/MuteMediator";
import { ProfileMediator } from "../settings/ProfileMediator";
import { RelayMediator } from "../settings/RelayMediator";
import SettingsDialog from "../settings/SettingsDialog";
import { relayInfo } from "../settings/relay-info-cache";
import {
  APPEARANCE_SAVE_DELAY_MS,
  DEFAULT_APPEARANCE,
  applyColors,
  savedColorScheme,
  setColorScheme,
} from "../theme";
import { notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";
import { trackReplaces } from "../write-progress";
import {
  setShowWriteProgress,
  showWriteProgress,
} from "../write-progress-setting";
import AddColumnPanel from "./AddColumnPanel";
import Column from "./Column";
import ColumnTitle from "./ColumnTitle";
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
    writer: trackReplaces(write.writer, "デッキの設定"),
    fetchLatest: write.fetchLatest,
    storage: localStorage,
  });
  // カラムは id で突き合わせて store に当てる。デッキは読み込み・同期・保存のたびに
  // 丸ごと新しい値になるので、そのまま <For> に渡すと全カラムが作り直され、購読・
  // スクロール位置・重ねた段がすべて消える。当てるのは複製 —— reconcile は store の
  // 中身をその場で書き換えるので、同期の層が持つ値を渡すと、そちらまで書き換わる。
  const [deckView, setDeckView] = createStore<{ columns: ColumnDef[] }>({
    columns: [],
  });
  createEffect(() => {
    const next = deckStore.value()?.columns ?? [];
    setDeckView("columns", reconcile(structuredClone(next), { key: "id" }));
  });
  const columns = () => deckView.columns;

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

  // カラムを見せる。広い画面では横に送って画面に収め、狭い画面ではそのタブを選ぶ。
  const focusColumn = (id: string) => {
    if (!isWide()) {
      applyUi({ type: "deck/select-column", id });
      return;
    }
    columnsEl
      ?.querySelector(`[data-column-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({
        inline: "nearest",
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  };

  // 1〜9 の数字キーで、その番号のカラムを見せる（v0 と同じ）。入力中・修飾キー付き・
  // ダイアログやパネルを開いている間は奪わない。
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest("input, textarea, select, [role=dialog]"))
    ) {
      return;
    }
    if (ui.settingsOpen || ui.panel !== undefined) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const column = columns()[Number(event.key) - 1];
    if (!column) return;
    event.preventDefault();
    focusColumn(column.id);
  };
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  // カラーテーマはこの端末に、色はデッキと一緒にアカウントに保存している。
  const [scheme, setScheme] = createSignal(savedColorScheme());
  // 選んだ色はまず画面に当て、保存は少し待ってからまとめて送る —— 色を選ぶたびに
  // 署名とリレーへの書き込みをすると、つまみを動かすだけで待たされる。
  const [appearance, setAppearance] =
    createSignal<DeckAppearance>(DEFAULT_APPEARANCE);
  createEffect(() => {
    const saved = deckStore.value()?.appearance;
    if (saved) setAppearance(saved);
  });
  createEffect(() => applyColors(appearance()));

  let appearanceTimer: ReturnType<typeof setTimeout> | undefined;
  let savingAppearance = false;
  const saveAppearance = (next: DeckAppearance) => {
    clearTimeout(appearanceTimer);
    appearanceTimer = setTimeout(() => {
      savingAppearance = true;
      deckStore.update((deck) => ({ ...deck, appearance: next }));
    }, APPEARANCE_SAVE_DELAY_MS);
  };
  // 保存はデッキの同期に任せているので、同期が終わった合図で知らせる。
  createEffect(() => {
    const current = deckStore.state();
    if (!savingAppearance) return;
    if (current.phase !== "ready" || current.sync !== "synced") return;
    savingAppearance = false;
    notifySaved("表示の設定を保存しました");
  });
  onCleanup(() => clearTimeout(appearanceTimer));
  // ログアウトしたら既定の色に戻す（次にログインする人に前の人の色を残さない）。
  onCleanup(() => applyColors(DEFAULT_APPEARANCE));

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
      case "deck/focus-column":
        focusColumn(event.id);
        return true;
      case "deck/open-settings":
      case "deck/close-settings":
        applyUi(event);
        return true;
      case "deck/set-color-scheme":
        setScheme(event.scheme);
        setColorScheme(event.scheme);
        return true;
      case "deck/preview-appearance":
        // 動かしている最中。画面にだけ当てる。
        setAppearance(event.appearance);
        return true;
      case "deck/logout":
        props.session.logout();
        return true;
      case "deck/set-write-progress":
        setShowWriteProgress(event.on);
        return true;
      case "deck/set-appearance":
        setAppearance(event.appearance);
        saveAppearance(event.appearance);
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
            <ComposeMediator
              send={(text) => write.actions.post(text)}
              failure="投稿できませんでした"
              onSent={() => handle({ type: "deck/close-panel" })}
            >
              {(state) => <ComposePanel state={state} />}
            </ComposeMediator>
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
          <ProfileMediator
            writer={trackReplaces(write.writer, "プロフィール")}
            pubkey={viewer}
            profile={write.profile}
          >
            <MuteMediator
              writer={trackReplaces(write.writer, "ミュート")}
              signer={props.session.signer}
              viewer={viewer}
              muteList={write.muteList}
              settled={write.muteListSettled}
            >
              <Switch>
                <Match when={warmUp.error}>
                  <p role="alert" class="c-danger p-4 text-caption">
                    フォローリストを取得できませんでした。
                  </p>
                </Match>
                <Match when={deckStore.value() === undefined}>
                  <p class="c-secondary p-4 text-caption">
                    デッキを読み込み中…
                  </p>
                </Match>
                <Match when={isWide()}>
                  <div class="flex h-dvh">
                    <Sidebar
                      pubkey={viewer}
                      columns={columns()}
                      onLogout={props.session.logout}
                    />
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
                              data-column-id={column.id}
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
                                handle({
                                  type: "deck/drop",
                                  targetId: column.id,
                                });
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
                              <ColumnTitle column={column()} />
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
                                ui.panel === undefined &&
                                ui.active === column.id,
                              "c-secondary":
                                ui.panel !== undefined ||
                                ui.active !== column.id,
                            }}
                            onClick={() =>
                              handle({
                                type: "deck/select-column",
                                id: column.id,
                              })
                            }
                          >
                            <span class="flex items-center gap-1.5">
                              <span
                                class={`size-4 ${columnMeta(column).icon}`}
                                aria-hidden="true"
                              />
                              <ColumnTitle column={column} />
                            </span>
                            <span
                              class="h-0.5 w-6 rounded-full"
                              classList={{
                                "bg-accent-primary":
                                  ui.panel === undefined &&
                                  ui.active === column.id,
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
                          handle({
                            type: "deck/open-panel",
                            panel: "add-column",
                          })
                        }
                      >
                        <span
                          class="i-material-symbols:add-rounded size-4.5"
                          aria-hidden="true"
                        />
                      </button>
                      <Show
                        when={columns().find(
                          (column) => column.id === ui.active,
                        )}
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
                                ui.panel !== undefined ||
                                ui.active !== column.id,
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
              <RelayMediator
                writer={trackReplaces(write.writer, "リレーの設定")}
                relayList={write.relayList}
                settled={write.relayListSettled}
                statusOf={(url) => props.readLayer.manager.pool.statusOf(url)}
                infoOf={relayInfo}
              >
                <SettingsDialog
                  open={ui.settingsOpen}
                  wide={isWide()}
                  scheme={scheme()}
                  appearance={appearance()}
                  writeProgress={showWriteProgress()}
                />
              </RelayMediator>
            </MuteMediator>
          </ProfileMediator>
        </Mediates>
      </ActionsMediator>
    </EventActionsProvider>
  );
};

export default DeckScreen;
