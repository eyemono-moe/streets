import { Collapsible } from "@ark-ui/solid";
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
import { effectiveBlossomServers } from "@streets/core/media/blossom";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { warmUpRouting } from "@streets/core/read/bootstrap";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { OUTBOX_ROUTING } from "@streets/core/read/read-routing";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { readRoutingFor } from "@streets/core/settings/read-routing-setting";
import { effectiveSearchRelays } from "@streets/core/settings/search-relay-list";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import AboutDialog from "../about/AboutDialog";
import { EventActionsProvider, createWriteStack } from "../actions";
import { ActionsMediator } from "../actions-mediator";
import { columnDigits, setColumnDigits } from "../column-digits-setting";
import { setDiagnostics } from "../devtools/diagnostics";
import { CustomEmojisMediator } from "../emoji/custom-emojis";
import { errorReport, setErrorReport } from "../error-report-setting";
import { useIsWide } from "../is-wide";
import { keymap, setShortcut } from "../keymap";
import { UploaderProvider, createUploader } from "../media/uploader";
import { ComposeMediator } from "../note/ComposeMediator";
import ComposePanel from "../note/ComposePanel";
import { readRoutingMode, setReadRoutingMode } from "../read-routing-setting";
import { screenshotMode } from "../screenshot-mode";
import type { Session } from "../session";
import { MediaMediator } from "../settings/MediaMediator";
import { MuteMediator } from "../settings/MuteMediator";
import { ProfileMediator } from "../settings/ProfileMediator";
import { RelayMediator } from "../settings/RelayMediator";
import { SearchRelayMediator } from "../settings/SearchRelayMediator";
import SettingsDialog from "../settings/SettingsDialog";
import { startTelemetry } from "../telemetry";
import {
  APPEARANCE_SAVE_DELAY_MS,
  DEFAULT_APPEARANCE,
  applyColors,
  savedColorScheme,
  setColorScheme,
} from "../theme";
import { notifySaved } from "../toast";
import { tourSeen } from "../tour-setting";
import { DeckTour, createDeckTour } from "../tour/DeckTour";
import { Mediates, type UiEvent } from "../ui-events";
import { trackReplaces } from "../write-progress";
import {
  setShowWriteProgress,
  showWriteProgress,
} from "../write-progress-setting";
import { ZapMediator } from "../zap/ZapMediator";
import AddColumnPanel from "./AddColumnPanel";
import Column from "./Column";
import ColumnSettingsPanel from "./ColumnSettingsPanel";
import DeckSyncNotice from "./DeckSyncNotice";
import { ComposeFab, MobileTabBar, MobileTopBar, Sidebar } from "./Nav";
import SearchPanel from "./SearchPanel";
import SidePanel, { SidePanelMotion } from "./SidePanel";
import { createDeckHotkeys } from "./deck-hotkeys";
import { createDeckStore } from "./deck-store";
import { relayListState } from "./relay-list";

const DeckScreen: Component<{
  readLayer: ReadLayer;
  session: Session;
  /** 開発時の `?relays=`。最初に引く先・行き先の分からない読み書き・検索を、ここへ寄せる。 */
  bootstrapIndexers?: RelayUrl[];
}> = (props) => {
  // App が pubkey ごとに作り直すので、この画面の間 viewer は変わらない。
  // biome-ignore lint/style/noNonNullAssertion: ログイン中にしか描かれない
  const viewer = props.session.pubkey()!;
  const write = createWriteStack({
    readLayer: props.readLayer,
    signer: props.session.signer,
    viewer,
    // 開発時の ?relays= では、書き込みも外のリレーへ流さない。
    fallbackRelays: props.bootstrapIndexers,
  });
  const isWide = useIsWide();
  const deckTour = createDeckTour(isWide);
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
      indexers: props.bootstrapIndexers,
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
  // Zap の受領を流してもらうリレー。自分が読むリレーに届けば、通知で拾える。
  const zapReceiptRelays = () => {
    const state = relayList();
    const read =
      state.phase === "ready"
        ? state.entries.filter((entry) => entry.read).map((entry) => entry.url)
        : [];
    return (read.length > 0 ? read : [...FALLBACK_RELAYS]).slice(0, 5);
  };

  // 読み込みリレーだけを読む設定なら、自分の一覧が変わるたびに読み先を当て直す。
  createEffect(() => {
    write.relayList();
    props.readLayer.manager.setReadRouting(
      readRoutingFor(
        readRoutingMode(),
        relayList(),
        props.bootstrapIndexers ?? FALLBACK_RELAYS,
      ),
    );
  });
  onCleanup(() => props.readLayer.manager.setReadRouting(OUTBOX_ROUTING));

  const [readPlan, setReadPlan] = createSignal(
    props.readLayer.manager.readPlan,
  );
  onCleanup(props.readLayer.manager.onReadPlanChanged(setReadPlan));

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
    // nextにproxyが含まれておりそのままだとstructuredCloneでDataCloneErrorが発生するためunwrapする
    setDeckView(
      "columns",
      reconcile(structuredClone(unwrap(next)), { key: "id" }),
    );
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

  // 画像のアップロード先は、設定（kind:10063）の並び順にそのまま使う。
  const uploader = createUploader({
    signer: props.session.signer,
    viewer,
    servers: () => effectiveBlossomServers(write.blossomServers()),
  });

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

  // 狭い画面のカラムの帯。払って止まった位置と、選んでいるカラムを行き来させる。
  let stripEl: HTMLDivElement | undefined;
  const stripIds = () => [
    ...(temp() ? [TEMP_COLUMN_ID] : []),
    ...columns().map((column) => column.id),
  ];
  const activeColumn = (): ColumnDef | undefined =>
    ui.active === TEMP_COLUMN_ID
      ? temp()
      : columns().find((column) => column.id === ui.active);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(settleTimer));
  // scrollend を持たないブラウザ（Safari）もあるので、止まってしばらく経ったら拾う。
  const onStripScroll = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!stripEl || stripEl.clientWidth === 0) return;
      const index = Math.round(stripEl.scrollLeft / stripEl.clientWidth);
      const id = stripIds()[index];
      if (id !== undefined && id !== ui.active) {
        applyUi({ type: "deck/select-column", id });
      }
    }, 120);
  };
  // タブや数字キーで選んだら、そのカラムまで送る。払って選んだときは既にそこにいる。
  let placed = false;
  createEffect(() => {
    const id = ui.active;
    const index = id === undefined ? -1 : stripIds().indexOf(id);
    if (isWide() || !stripEl || index < 0) return;
    const left = index * stripEl.clientWidth;
    if (Math.abs(stripEl.scrollLeft - left) < 2) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 開いた直後は動かさずにその場へ置く。
    stripEl.scrollTo({
      left,
      behavior: placed && !reduced ? "smooth" : "auto",
    });
    placed = true;
  });

  // この端末で一度も見ていなければ、カラムが出てから使い方を案内する。
  // ダイアログが開いている間は待つ（閉じたら出す）。
  // スクリーンショットを撮るとき（?screenshot）は、案内を写さない。
  let tourOffered = tourSeen() || screenshotMode();
  createEffect(() => {
    if (tourOffered) return;
    if (deckStore.value() === undefined || columns().length === 0) return;
    if (ui.settingsOpen || ui.aboutOpen) return;
    tourOffered = true;
    // カラムが描かれてから指す。
    requestAnimationFrame(() => deckTour.start());
  });

  createDeckHotkeys({
    keymap,
    columns,
    enabled: () => !ui.settingsOpen && !ui.aboutOpen,
    panelOpen: () => ui.panel !== undefined,
    columnDigits,
    togglePanel: (panel) => handle({ type: "deck/toggle-panel", panel }),
    focusColumn,
  });

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
      case "deck/toggle-panel":
      case "deck/close-panel":
      case "deck/select-column":
      case "deck/drag-start":
      case "deck/drag-end":
        applyUi(event);
        return true;
      case "deck/toggle-settings": {
        const opening = ui.settingsFor !== event.id;
        applyUi(event);
        if (opening) {
          // 設定の列は幅 0 から広がる。広がりきる前に送ると、まだ無い幅までしか送れず画面の外に残る。
          requestAnimationFrame(async () => {
            const panel = columnsEl?.querySelector(
              `[data-settings-for="${CSS.escape(event.id)}"]`,
            );
            const growing = panel?.parentElement?.getAnimations() ?? [];
            await Promise.allSettled(growing.map((a) => a.finished));
            if (ui.settingsFor !== event.id) return;
            panel?.scrollIntoView({
              inline: "nearest",
              block: "nearest",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
            });
          });
        }
        return true;
      }
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
      case "deck/open-about":
      case "deck/close-about":
        applyUi(event);
        return true;
      case "deck/start-tour":
        // 「Streets について」から始めたときは、ダイアログを閉じてから指す。
        applyUi({ type: "deck/close-about" });
        requestAnimationFrame(() => deckTour.start());
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
      case "deck/set-read-routing":
        setReadRoutingMode(event.mode);
        return true;
      case "deck/set-shortcut":
        setShortcut(event.action, event.hotkey);
        return true;
      case "deck/set-column-digits":
        setColumnDigits(event.on);
        return true;
      case "deck/set-error-report":
        setErrorReport(event.on);
        // 止めたらその場で送るのをやめ、戻したらもう一度用意する。
        void startTelemetry();
        return true;
      case "deck/set-appearance":
        setAppearance(event.appearance);
        saveAppearance(event.appearance);
        return true;
      default:
        return false;
    }
  };

  // 閉じる動きの間も、最後に開いていたパネルの中身を描き続ける。
  const shownPanel = createMemo<typeof ui.panel>((last) => ui.panel ?? last);

  const panelView = (full: boolean) => (
    <Show when={shownPanel()}>
      {(current) => (
        <Show
          when={current() === "compose"}
          fallback={
            <Show
              when={current() === "search"}
              fallback={
                <SidePanel
                  title="カラムを追加する"
                  icon="i-material-symbols:add-rounded"
                  full={full}
                >
                  <AddColumnPanel relayList={relayList()} />
                </SidePanel>
              }
            >
              <SidePanel
                title="検索する"
                icon="i-material-symbols:search-rounded"
                full={full}
              >
                <SearchPanel />
              </SidePanel>
            </Show>
          }
        >
          <SidePanel
            title="投稿する"
            icon="i-material-symbols:edit-square-outline-rounded"
            full={full}
          >
            <ComposeMediator
              send={(text, media, emoji) =>
                write.actions.post(text, media, emoji)
              }
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
    // 検索の問い合わせ先。設定（kind:10007）を変えたら、次の購読から効く。
    // 開発時の ?relays= では、検索も差し替えた先へ聞く（外の既定の検索リレーへ行かない）。
    searchRelays: () =>
      props.bootstrapIndexers ?? effectiveSearchRelays(write.searchRelays()),
  };

  return (
    <EventActionsProvider value={write.actions}>
      {/* デッキが裁定しなかった単発の操作（いいね・フォローなど）は、その外側が受ける。 */}
      <ActionsMediator actions={write.actions}>
        <Mediates handle={handle}>
          <MediaMediator
            writer={trackReplaces(write.writer, "画像のアップロード先")}
            serverList={write.blossomServers}
          >
            <SearchRelayMediator
              writer={trackReplaces(write.writer, "検索するリレー")}
              relayList={write.searchRelays}
            >
              <CustomEmojisMediator
                writer={trackReplaces(write.writer, "自分の絵文字")}
                list={write.emojiList}
                fetchLatest={write.fetchLatest}
              >
                <UploaderProvider value={uploader}>
                  <ProfileMediator
                    writer={trackReplaces(write.writer, "プロフィール")}
                    pubkey={viewer}
                    profile={write.profile}
                  >
                    <RelayMediator
                      writer={trackReplaces(write.writer, "リレーの設定")}
                      relayList={write.relayList}
                      settled={write.relayListSettled}
                      statusOf={(url) =>
                        props.readLayer.manager.pool.statusOf(url)
                      }
                      readPlan={readPlan}
                      routingSettled={settled}
                      followees={followees}
                    >
                      <MuteMediator
                        writer={trackReplaces(write.writer, "ミュート")}
                        signer={props.session.signer}
                        viewer={viewer}
                        muteList={write.muteList}
                        settled={write.muteListSettled}
                      >
                        <ZapMediator
                          signer={props.session.signer}
                          viewer={viewer}
                          store={props.readLayer.store}
                          pool={props.readLayer.manager.pool}
                          relays={zapReceiptRelays}
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
                                  panel={ui.panel}
                                  numbers={columnDigits()}
                                  onLogout={props.session.logout}
                                />
                                <SidePanelMotion open={ui.panel !== undefined}>
                                  {panelView(false)}
                                </SidePanelMotion>
                                <div class="flex min-w-0 flex-1 flex-col">
                                  <DeckSyncNotice store={deckStore} />
                                  {/* カラムの間の 1px を背景色で見せる。横に溢れたら横スクロールする。 */}
                                  <div
                                    ref={columnsEl}
                                    class="flex min-h-0 flex-1 overflow-x-auto bg-tertiary"
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
                                        <p
                                          role="alert"
                                          class="c-secondary text-caption"
                                        >
                                          このリンクは読めませんでした：
                                          {params.entity}
                                        </p>
                                      </div>
                                    </Show>
                                    <For each={columns()}>
                                      {(column, index) => (
                                        <>
                                          <div
                                            data-column-id={column.id}
                                            data-tour={
                                              index() === 0
                                                ? "columns"
                                                : undefined
                                            }
                                            class="h-full shrink-0 border-primary border-r"
                                            classList={{
                                              "w-80": column.width === "s",
                                              "w-95":
                                                column.width !== "s" &&
                                                column.width !== "l",
                                              "w-110": column.width === "l",
                                              "opacity-50":
                                                ui.dragging === column.id,
                                            }}
                                            onDragOver={(event) =>
                                              event.preventDefault()
                                            }
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
                                              settingsOpen={
                                                ui.settingsFor === column.id
                                              }
                                              draggable
                                              {...shared}
                                            />
                                          </div>
                                          <Collapsible.Root
                                            lazyMount
                                            unmountOnExit
                                            open={ui.settingsFor === column.id}
                                            class="bg-secondary"
                                          >
                                            <Collapsible.Content class="motion-collapse-right h-full overflow-hidden">
                                              <div
                                                data-settings-for={column.id}
                                                class="h-full w-95 shrink-0 border-primary border-r"
                                              >
                                                <ColumnSettingsPanel
                                                  column={column}
                                                  relayList={relayList()}
                                                />
                                              </div>
                                            </Collapsible.Content>
                                          </Collapsible.Root>
                                        </>
                                      )}
                                    </For>
                                  </div>
                                </div>
                              </div>
                            </Match>
                            <Match when={true}>
                              <div class="relative flex h-dvh flex-col">
                                <div class="h-0.75 shrink-0 bg-accent-primary" />
                                <MobileTopBar
                                  pubkey={viewer}
                                  column={
                                    ui.panel === undefined
                                      ? activeColumn()
                                      : undefined
                                  }
                                  temporary={ui.active === TEMP_COLUMN_ID}
                                  settingsOpen={
                                    ui.active !== undefined &&
                                    ui.settingsFor === ui.active
                                  }
                                  onLogout={props.session.logout}
                                />
                                <DeckSyncNotice store={deckStore} />
                                <div class="relative min-h-0 flex-1">
                                  {/*
                                    カラムを横に並べ、1 枚ずつ止まるように送る（左右に払って切り替える）。
                                    隠れたカラムも描いたままにする —— 取り外すと購読ごと消え、戻るたびに
                                    取得し直しになり、スクロール位置も失われる。
                                  */}
                                  <div
                                    ref={stripEl}
                                    class="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
                                    onScroll={onStripScroll}
                                  >
                                    <Show when={temp()}>
                                      {(column) => (
                                        <div class="isolate h-full w-full shrink-0 snap-start snap-always">
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
                                        <div class="isolate h-full w-full shrink-0 snap-start snap-always">
                                          <div
                                            class="h-full"
                                            classList={{
                                              hidden:
                                                ui.settingsFor === column.id,
                                            }}
                                          >
                                            <Column
                                              column={column}
                                              settingsOpen={
                                                ui.settingsFor === column.id
                                              }
                                              chrome={false}
                                              {...shared}
                                            />
                                          </div>
                                          <Show
                                            when={ui.settingsFor === column.id}
                                          >
                                            <div class="h-full">
                                              <ColumnSettingsPanel
                                                column={column}
                                                relayList={relayList()}
                                              />
                                            </div>
                                          </Show>
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                  <SidePanelMotion
                                    open={ui.panel !== undefined}
                                    full
                                  >
                                    {panelView(true)}
                                  </SidePanelMotion>
                                  {/* パネルを開いている間は、送信ボタンと重なるので出さない。 */}
                                  <Show when={ui.panel === undefined}>
                                    <ComposeFab />
                                  </Show>
                                </div>
                                <MobileTabBar
                                  columns={columns()}
                                  temp={temp()}
                                  active={
                                    ui.panel === undefined
                                      ? ui.active
                                      : undefined
                                  }
                                  panel={ui.panel}
                                />
                              </div>
                            </Match>
                          </Switch>
                          <AboutDialog
                            open={ui.aboutOpen}
                            wide={isWide()}
                            tour
                            onOpenUser={(pubkey) => {
                              handle({ type: "deck/close-about" });
                              navigate(`/${encodeBech32("npub", pubkey)}`);
                            }}
                          />
                          <DeckTour tour={deckTour.tour} />
                          <SettingsDialog
                            open={ui.settingsOpen}
                            wide={isWide()}
                            scheme={scheme()}
                            appearance={appearance()}
                            writeProgress={showWriteProgress()}
                            errorReport={errorReport()}
                            keymap={keymap()}
                            columnDigits={columnDigits()}
                          />
                        </ZapMediator>
                      </MuteMediator>
                    </RelayMediator>
                  </ProfileMediator>
                </UploaderProvider>
              </CustomEmojisMediator>
            </SearchRelayMediator>
          </MediaMediator>
        </Mediates>
      </ActionsMediator>
    </EventActionsProvider>
  );
};

export default DeckScreen;
