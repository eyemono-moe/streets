import { Collapsible } from "@ark-ui/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { chosenRelays } from "@streets/core/deck/chosen-relays";
import { buildRelayColumn } from "@streets/core/deck/column-presets";
import {
  type ColumnDef,
  type Deck,
  type DeckAppearance,
  defaultColumns,
} from "@streets/core/deck/deck";
import {
  addColumnTo,
  moveColumnIn,
  moveColumnToIn,
  removeColumnFrom,
  updateColumnIn,
} from "@streets/core/deck/deck-mutations";
import {
  activeDeck,
  addDeck,
  moveDeckTo,
  nextDeckName,
  removeDeck,
  renameDeck,
  updateDeckIn,
} from "@streets/core/deck/deck-set";
import {
  type DeckUiEvent,
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "@streets/core/deck/deck-ui";
import { browseTargetIn, welcomeColumn } from "@streets/core/deck/guest-deck";
import { loopStrip } from "@streets/core/deck/strip-loop";
import { TEMP_COLUMN_ID, tempColumnFor } from "@streets/core/deck/temp-column";
import { effectiveBlossomServers } from "@streets/core/media/blossom";
import { parseNip96Servers } from "@streets/core/media/nip96";
import { uploadServers } from "@streets/core/media/upload-servers";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { warmUpRouting } from "@streets/core/read/bootstrap";
import {
  BOOTSTRAP_INDEXERS,
  FALLBACK_RELAYS,
} from "@streets/core/read/default-relays";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { OUTBOX_ROUTING } from "@streets/core/read/read-routing";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { readRoutingFor } from "@streets/core/settings/read-routing-setting";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import {
  effectiveSearchRelays,
  parseSearchRelays,
} from "@streets/core/settings/search-relay-list";
import type { ComposeDraft } from "@streets/core/view/compose-drafts";
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
  on,
  onCleanup,
  untrack,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { setActionLayout } from "../action-layout-setting";
import {
  EventActionsProvider,
  type WriteStack,
  createWriteStack,
} from "../actions";
import { ActionsMediator } from "../actions-mediator";
import { applyBlockedRelays } from "../blocked-relays";
import { setChatOrder } from "../chat-order-setting";
import { ChannelFormMediator } from "../chat/ChannelFormMediator";
import { columnDigits, setColumnDigits } from "../column-digits-setting";
import { setColumnPartOpen } from "../column-part-memory";
import { columnStretch, setColumnStretch } from "../column-stretch-setting";
import { columnView } from "../columns/column-views";
import { setContentWarningMode } from "../content-warning-setting";
import {
  deckLayout,
  isMultiColumn,
  setDeckLayout,
} from "../deck-layout-setting";
import {
  defaultReaction,
  setDefaultReaction,
} from "../default-reaction-setting";
import { setDiagnostics } from "../devtools/diagnostics";
import { CustomEmojisMediator } from "../emoji/custom-emojis";
import { preloadEmojiPicker } from "../emoji/lazy-emoji-picker";
import { errorReport, setErrorReport } from "../error-report-setting";
import { setImageDownscaling } from "../image-downscaling-setting";
import { useIsWide } from "../is-wide";
import { keymap, setShortcut } from "../keymap";
import { lazyPart, onceTrue, whenIdle } from "../lazy-part";
import { FollowSetMediator } from "../lists/FollowSetMediator";
import {
  type LoginGate,
  LoginGateProvider,
  createGuestActions,
} from "../login-gate";
import { UploaderProvider, createUploader } from "../media/uploader";
import { composeDrafts } from "../note/compose-drafts";
import { ComposeMediator } from "../note/ComposeMediator";
import ComposePanel from "../note/ComposePanel";
import TargetComposeDialog from "../note/TargetComposeDialog";
import { readRoutingMode, setReadRoutingMode } from "../read-routing-setting";
import { screenshotMode } from "../screenshot-mode";
import type { Session } from "../session";
import { BlockedRelayMediator } from "../settings/BlockedRelayMediator";
import { MediaMediator } from "../settings/MediaMediator";
import { MuteMediator } from "../settings/MuteMediator";
import { ProfileMediator } from "../settings/ProfileMediator";
import { RelayMediator } from "../settings/RelayMediator";
import { SearchRelayMediator } from "../settings/SearchRelayMediator";
import { StatusFormMediator } from "../status/StatusFormMediator";
import {
  ANY_COLUMN,
  measureUntilPaint,
  startMeasure,
  startTelemetry,
  whenColumnShows,
} from "../telemetry";
import {
  APPEARANCE_SAVE_DELAY_MS,
  DEFAULT_APPEARANCE,
  applyColors,
  applyUiContrast,
  savedColorScheme,
  savedUiContrast,
  setColorScheme,
  setUiContrast,
} from "../theme";
import { setTimeFormat } from "../time-format-setting";
import { notifyError, notifyInfo, notifySaved, notifyWarning } from "../toast";
import { tourSeen } from "../tour-setting";
import { Mediates, type UiEvent } from "../ui-events";
import { createSortable } from "../ui/sortable";
import { WELCOME_RELAYS } from "../welcome/welcome-relays";
import {
  type WelcomeLogin,
  WelcomeLoginProvider,
} from "../welcome/WelcomeColumn";
import { trackReplaces } from "../write-progress";
import {
  setShowWriteProgress,
  showWriteProgress,
} from "../write-progress-setting";
import { ZapMediator } from "../zap/ZapMediator";
import AddColumnPanel from "./AddColumnPanel";
import Column from "./Column";
import { createColumnOrder } from "./column-order";
import { columnWidthStyle } from "./column-width";
import ColumnAccentBar from "./ColumnAccentBar";
import ColumnArrangePanel from "./ColumnArrangePanel";
import ColumnSettingsPanel from "./ColumnSettingsPanel";
import { createDeckHotkeys } from "./deck-hotkeys";
import {
  createDeckStore,
  createGuestDeckStore,
  saveActiveDeckId,
  savedActiveDeckId,
} from "./deck-store";
import DeckEditHeader from "./DeckEditHeader";
import DeckEndSpace from "./DeckEndSpace";
import DeckSyncNotice from "./DeckSyncNotice";
import GuestMediator from "./GuestMediator";
import { ComposeFab, MobileTabBar, MobileTopBar, Sidebar } from "./Nav";
import NewDeckPanel from "./NewDeckPanel";
import { openPipWindow } from "./pip-window";
import { relayListState } from "./relay-list";
import SearchPanel from "./SearchPanel";
import SidePanel, { SidePanelMotion } from "./SidePanel";
import UnreadableLink from "./UnreadableLink";

// 開くまで要らないものは別のファイルに分け、起動が落ち着いてから読む。
const SettingsDialog = lazyPart(() => import("../settings/SettingsDialog"));
const CommandPalette = lazyPart(() => import("../signal/CommandPalette"));
const AboutDialog = lazyPart(() => import("../about/AboutDialog"));
const DeckTour = lazyPart(() => import("../tour/DeckTour"));

// 開くたびに 1 度だけ知らせる。アカウントを切り替えて画面が作り直されても繰り返さない。
let localOnlyWarned = false;

const DeckScreen: Component<{
  readLayer: ReadLayer;
  session: Session;
  /** 開発時の `?relays=`。最初に引く先・行き先の分からない読み書き・検索を、ここへ寄せる。 */
  bootstrapIndexers?: RelayUrl[];
}> = (props) => {
  // App が pubkey ごとに作り直すので、この画面の間 viewer は変わらない。
  // ログインしていなければ undefined で、書き込みの仕組みを作らない。
  const account = props.session.pubkey();
  const viewer = account ?? "";
  // 書き込みの仕組みも作るときに自分の一覧を取りに繋ぐので、それより先に当てる。
  if (account) {
    applyBlockedRelays(props.readLayer.manager, account, () =>
      write?.blockedRelays(),
    );
  }
  const write: WriteStack | undefined = account
    ? createWriteStack({
        readLayer: props.readLayer,
        signer: props.session.signer,
        viewer: account,
        // 開発時の ?relays= では、書き込みも外のリレーへ流さない。
        fallbackRelays: props.bootstrapIndexers,
        // 送るときに読む。デッキはこの後で作るが、送るのはその後になる。
        clientTag: () => clientTag(),
        notifyQuoted: () => notifyQuoted(),
      })
    : undefined;
  const actions = write?.actions ?? createGuestActions();
  const isWide = useIsWide();
  // 増えるたびに案内を始める。0 のうちは案内の部品を読み込まない。
  const [tourRequests, setTourRequests] = createSignal(0);
  const startTour = () => setTourRequests((count) => count + 1);
  // 保存しない画面の状態。遷移は core の純粋関数で、ここは結果を store へ当てるだけ。
  const [ui, setUi] = createStore<DeckUiState>(emptyDeckUi());
  const applyUi = (event: DeckUiEvent) =>
    setUi(reconcile(deckUiTransition(unwrap(ui), event)));
  // 閉じる動きを見せるため、一度開いたら残す。
  const settingsMounted = onceTrue(() => ui.settingsOpen);
  const paletteMounted = onceTrue(() => ui.paletteOpen);
  const aboutMounted = onceTrue(() => ui.aboutOpen);
  whenIdle(() => {
    SettingsDialog.preload();
    CommandPalette.preload();
    AboutDialog.preload();
    preloadEmojiPicker();
  });
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
    const live = actions.followeeIds();
    return live.length > 0 ? live : (warmUp()?.followees ?? []);
  };
  const relayList = (): RelayListState =>
    account
      ? relayListState(props.readLayer.store, account, settled())
      : { phase: "signed-out" };
  // 読み込みリレーだけを読む設定なら、自分の一覧が変わるたびに読み先を当て直す。
  createEffect(() => {
    write?.relayList();
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

  const deckStore = write
    ? createDeckStore({
        pubkey: props.session.pubkey,
        // ルーティングが決まる前に置換すると、自分の write リレーが分からないまま送ることになる。
        routingSettled: settled,
        signer: props.session.signer,
        canSign: () => props.session.signerStatus() === "ready",
        writer: trackReplaces(write.writer, "デッキの設定"),
        fetchLatest: write.fetchLatest,
        storage: localStorage,
      })
    : createGuestDeckStore(localStorage);
  // 自分で選んだリレーは、手元のもの（localhost など）でも繋ぐ。新しい組を許してから
  // 前の組を下ろす —— 先に下ろすと、変わらないリレーまで一度閉じてしまう。
  let releaseChosenRelays: (() => void) | undefined;
  createEffect(() => {
    write?.relayList();
    const release = props.readLayer.manager.allowLocalRelays(
      chosenRelays({
        relayList: relayList(),
        searchRelays: parseSearchRelays(write?.searchRelays()),
        decks: deckStore.value(),
      }),
    );
    releaseChosenRelays?.();
    releaseChosenRelays = release;
  });
  onCleanup(() => releaseChosenRelays?.());
  // どのデッキを開いているかは端末ごとに覚える。アカウントには保存しない。
  // この画面で選び直したもの。アカウントを切り替えたら、その人が端末に覚えたものへ戻る。
  const [chosenDeck, setChosenDeck] = createSignal<{
    pubkey: string;
    id: string;
  }>();
  // ログインしていない人は「guest」として覚える（アカウントの pubkey とは重ならない）。
  const deckOwner = account ?? "guest";
  const activeDeckId = () => {
    const chosen = chosenDeck();
    return chosen?.pubkey === deckOwner
      ? chosen.id
      : savedActiveDeckId(deckOwner);
  };
  const switchDeck = (id: string) => {
    setChosenDeck({ pubkey: deckOwner, id });
    saveActiveDeckId(deckOwner, id);
  };
  const currentDeck = (): Deck | undefined => {
    const set = deckStore.value();
    return set && activeDeck(set, activeDeckId());
  };
  const deckSummaries = () =>
    deckStore.value()?.decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      columns: deck.columns.length,
    })) ?? [];
  // カラムの操作は、開いているデッキにだけ当てる。
  const updateDeck = (update: (deck: Deck) => Deck) =>
    deckStore.update((set) =>
      updateDeckIn(set, activeDeck(set, activeDeckId()).id, update),
    );
  // カラムは id で突き合わせて store に当てる。デッキは読み込み・同期・保存のたびに
  // 丸ごと新しい値になるので、そのまま <For> に渡すと全カラムが作り直され、購読・
  // スクロール位置・重ねた段がすべて消える。当てるのは複製 —— reconcile は store の
  // 中身をその場で書き換えるので、同期の層が持つ値を渡すと、そちらまで書き換わる。
  const [deckView, setDeckView] = createStore<{ columns: ColumnDef[] }>({
    columns: [],
  });
  createEffect(() => {
    const next = currentDeck()?.columns ?? [];
    // nextにproxyが含まれておりそのままだとstructuredCloneでDataCloneErrorが発生するためunwrapする
    setDeckView(
      "columns",
      reconcile(structuredClone(unwrap(next)), { key: "id" }),
    );
  });
  const columns = () => deckView.columns;
  const order = createColumnOrder(columns, () => ui.dragging);

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
    const endOpen = startMeasure("column.open", "ui.column");
    whenColumnShows(added.id, () => endOpen({ kind: added.source.kind }));
    updateDeck((deck) => addColumnTo(deck, added));
    applyUi({ type: "deck/column-added", id: added.id });
    scrollToEnd();
  };

  // ログインしてから（保存済みのログインなら開いてから）、最初の中身が出るまで。
  const endFirstContent = startMeasure("deck.first-content", "ui.load");
  onCleanup(
    whenColumnShows(ANY_COLUMN, () =>
      endFirstContent({ columns: columns().length }),
    ),
  );

  // 画像のアップロード先は、設定（kind:10063・kind:10096）の並び順にそのまま使う。
  const uploader = createUploader({
    signer: props.session.signer,
    viewer,
    servers: () =>
      uploadServers(
        effectiveBlossomServers(write?.blossomServers()),
        parseNip96Servers(write?.nip96Servers()),
      ),
  });

  // カラムの見出しを押したときの動き。狭い画面では見出しの代わりにタブから呼ぶ。
  const columnHeaders = new Map<string, () => void>();

  // カラムを見せる。広い画面では横に送って画面に収め、狭い画面ではそのタブを選ぶ。
  const focusColumn = (id: string) => {
    if (!isMultiColumn()) {
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

  // 広い画面で、カラムの見出しを掴んで並べ替える。
  const deckSort = createSortable({
    axis: "x",
    container: () => columnsEl,
    scroller: () => columnsEl,
    element: (id) =>
      columnsEl?.querySelector<HTMLElement>(
        `[data-column-id="${CSS.escape(id)}"]`,
      ) ?? undefined,
    order: order.ids,
    start: (id, index) => handle({ type: "deck/drag-start", id, index }),
    move: (to) => handle({ type: "deck/drag-move", to }),
    drop: () => handle({ type: "deck/drop" }),
    cancel: () => handle({ type: "deck/drag-end" }),
  });

  // 狭い画面のカラムの帯。払って止まった位置と、選んでいるカラムを行き来させる。
  // 帯が出てから置きたいので、要素も追えるようにしておく。
  const [strip, setStrip] = createSignal<HTMLDivElement>();
  // 見た目の並び。並べ替えている間は、帯のカラムも CSS の order で入れ替わって見える。
  const stripIds = () => [...(temp() ? [TEMP_COLUMN_ID] : []), ...order.ids()];
  // 端から反対の端へ払えるよう、帯は stripAnchor を真ん中に置いて回した順に並べる。
  // 止まったところが端なら、選んだカラムへ置き直す。
  const [stripAnchor, setStripAnchor] = createSignal<string>();
  const loopedIds = createMemo(() => loopStrip(stripIds(), stripAnchor()));
  const stripOrder = (id: string) => loopedIds().indexOf(id);
  // 選んでいるカラムが端に着いていたら、真ん中へ置き直す。並びを回すのと同じフレームで
  // 帯もそこへ送り、見えているカラムを変えない。両隣があるうちは触らない ——
  // 帯を送るたびに、吸着の途中で次に払おうとした指とぶつかる機会が増える。
  const recenterStrip = () => {
    const id = ui.active;
    const stripEl = strip();
    if (!stripEl || id === undefined) return;
    const ids = loopedIds();
    const before = ids.indexOf(id);
    if (before > 0 && before < ids.length - 1) return;
    setStripAnchor(id);
    // 並びが変わるとブラウザが見ていたカラムへ吸着し直すことがあるので、送る量ではなく
    // 行き先の位置で置く。
    stripEl.scrollLeft = loopedIds().indexOf(id) * stripEl.clientWidth;
  };
  const activeColumn = (): ColumnDef | undefined =>
    ui.active === TEMP_COLUMN_ID
      ? temp()
      : columns().find((column) => column.id === ui.active);
  // 指が触れている間は、止まって見えても払っている途中。並びを回すと指の下で帯が跳ぶ。
  let touching = false;
  const settleStrip = () => {
    const stripEl = strip();
    if (touching || !stripEl || stripEl.clientWidth === 0) return;
    // パネルが帯を覆っている間は、人が払ったのではない。並べ替えで order が変わると、
    // ブラウザは見ていたカラムへ吸着し直して帯を送る。ここで選ぶとパネルが閉じる。
    if (ui.panel === undefined) {
      const index = Math.round(stripEl.scrollLeft / stripEl.clientWidth);
      const id = loopedIds()[index];
      if (id !== undefined && id !== ui.active) {
        applyUi({ type: "deck/select-column", id });
      }
    }
    recenterStrip();
  };
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(settleTimer));
  // scrollend を持たないブラウザもあるので、止まってしばらく経ったら拾う。
  const onStripScroll = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleStrip, 120);
  };
  const mountStrip = (el: HTMLDivElement) => {
    placed = false;
    setStrip(el);
    el.addEventListener(
      "touchstart",
      () => {
        touching = true;
      },
      { passive: true },
    );
    const release = () => {
      touching = false;
      onStripScroll();
    };
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    // 持っているブラウザでは、吸着まで終わった時点で待たずに拾う。
    el.addEventListener("scrollend", () => {
      clearTimeout(settleTimer);
      settleStrip();
    });
  };
  // タブや数字キーで選んだら、そのカラムまで送る。払って選んだときは既にそこにいる。
  // 真ん中へ置き直すのは止まってから —— 送っている途中で並びを回すと、行き先がずれる。
  let placed = false;
  createEffect(() => {
    const id = ui.active;
    const ids = stripIds();
    const stripEl = strip();
    if (isMultiColumn() || !stripEl || id === undefined) return;
    // 開いた直後と、真ん中にあったカラムが消えたときは、選んでいるカラムを真ん中にする。
    const anchor = untrack(stripAnchor);
    if (anchor === undefined || !ids.includes(anchor)) setStripAnchor(id);
    // 回した並びが CSS の order に当たってから送る。
    queueMicrotask(() => {
      const index = loopedIds().indexOf(id);
      if (index < 0) return;
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
  });

  // この端末で一度も見ていなければ、カラムが出てから使い方を案内する。
  // ダイアログが開いている間は待つ（閉じたら出す）。
  // スクリーンショットを撮るとき（?screenshot）は、案内を写さない。
  // ログインしていない人には紹介のカラムがあるので、ログインしてから案内する。
  let tourOffered = tourSeen() || screenshotMode() || account === undefined;
  createEffect(() => {
    if (tourOffered) return;
    if (deckStore.value() === undefined || columns().length === 0) return;
    if (ui.settingsOpen || ui.aboutOpen) return;
    tourOffered = true;
    // カラムが描かれてから指す。
    requestAnimationFrame(startTour);
  });

  createDeckHotkeys({
    keymap,
    columns,
    enabled: () => !ui.settingsOpen && !ui.aboutOpen && !ui.paletteOpen,
    panelOpen: () => ui.panel !== undefined,
    columnDigits,
    togglePanel: (panel) => {
      // ショートカットは段を通らずに呼ぶので、投稿のパネルはここで止める。
      if (panel === "compose" && !gate("投稿")) return;
      handle({ type: "deck/toggle-panel", panel });
    },
    openPalette: () => handle({ type: "deck/open-palette" }),
    focusColumn,
  });

  // カラーテーマはこの端末に、色はデッキと一緒にアカウントに保存している。
  const [scheme, setScheme] = createSignal(savedColorScheme());
  const [uiContrast, setContrast] = createSignal(savedUiContrast());
  // 選んだ色はまず画面に当て、保存は少し待ってからまとめて送る —— 色を選ぶたびに
  // 署名とリレーへの書き込みをすると、つまみを動かすだけで待たされる。
  const [appearance, setAppearance] =
    createSignal<DeckAppearance>(DEFAULT_APPEARANCE);
  createEffect(() => {
    const saved = deckStore.value()?.appearance;
    if (saved) setAppearance(saved);
  });
  createEffect(() => applyColors(appearance()));

  // 投稿に client タグを付けるか。色と同じくデッキと一緒にアカウントへ保存する。
  const clientTag = (): boolean => deckStore.value()?.clientTag === true;
  // 引用した先の作者に知らせるか。無ければ知らせる。
  const notifyQuoted = (): boolean => deckStore.value()?.notifyQuoted !== false;

  let appearanceTimer: ReturnType<typeof setTimeout> | undefined;
  // 保存し終えたら出す知らせ。保存はデッキの同期に任せている。
  let savedNotice: string | undefined;
  const saveAppearance = (next: DeckAppearance) => {
    clearTimeout(appearanceTimer);
    appearanceTimer = setTimeout(() => {
      savedNotice = "表示の設定を保存しました";
      deckStore.update((set) => ({ ...set, appearance: next }));
    }, APPEARANCE_SAVE_DELAY_MS);
  };
  // 同期が終わった合図で知らせる。同期できない署名器では、この端末に保存した時点で知らせる。
  createEffect(() => {
    const current = deckStore.state();
    if (!savedNotice) return;
    if (
      current.phase !== "ready" ||
      (current.sync !== "synced" && current.sync !== "local-only")
    ) {
      return;
    }
    notifySaved(savedNotice);
    savedNotice = undefined;
  });
  createEffect(() => {
    const current = deckStore.state();
    if (current.phase !== "ready" || current.sync !== "local-only") return;
    if (localOnlyWarned) return;
    localOnlyWarned = true;
    notifyWarning(
      "このログインの方法では、デッキをほかの端末と同期できません",
      "デッキの変更はこの端末にだけ保存します。同期するには、暗号化に対応した拡張機能か、署名アプリでログインしてください。",
    );
  });
  onCleanup(() => clearTimeout(appearanceTimer));
  // ログアウトしたら既定の色に戻す（次にログインする人に前の人の色を残さない）。
  onCleanup(() => applyColors(DEFAULT_APPEARANCE));

  // ログインしていない人に、紹介とログインのカラムを見せる。外していたら先頭に戻す。
  const showLogin = (what?: string) => {
    if (what) notifyInfo(`ログインすると、${what}ができます`);
    applyUi({ type: "deck/close-panel" });
    applyUi({ type: "deck/close-settings" });
    let id = columns().find((column) => column.source.kind === "welcome")?.id;
    if (id === undefined) {
      const column = welcomeColumn();
      id = column.id;
      updateDeck((deck) =>
        moveColumnToIn(addColumnTo(deck, column), column.id, 0),
      );
    }
    const target = id;
    requestAnimationFrame(() => focusColumn(target));
  };
  // 紹介のカラムからのログイン。ログインしたら App がこの画面ごと作り直す。
  const welcomeLogin: WelcomeLogin = {
    state: () => ({
      pending: props.session.pending(),
      error: props.session.error(),
      authUrl: props.session.authUrl(),
      restoreFailed: props.session.restoreFailed(),
    }),
    onExtension: () => void props.session.loginWithExtension(),
    onNosskey: () => void props.session.loginWithNosskey(),
    onBunker: (uri) => void props.session.loginWithBunker(uri),
    onNostrConnect: props.session.loginWithNostrConnect,
    onRetryRestore: props.session.restore,
  };
  const gate: LoginGate = (what) => {
    if (account) return true;
    showLogin(what);
    return false;
  };

  // デッキの段の Mediator。カラムの段が裁定しなかったイベントがここへ上がってくる。
  // 下書きの一覧から開いた返信・引用。パネルを閉じても残るよう、デッキが持つ。
  const [draftDialog, setDraftDialog] = createSignal<ComposeDraft>();
  // ピクチャーインピクチャーは 1 枚だけ。どのカラムを出しているかは ui.poppedOut、窓そのものはここに持つ。
  const [pipWindow, setPipWindow] = createSignal<Window>();
  // カラムを消した・デッキを替えたなどで、出しているカラムが無くなったらピクチャーインピクチャーを閉じる。
  createEffect(
    on(
      () => ui.poppedOut,
      (id) => {
        if (id === undefined) untrack(pipWindow)?.close();
      },
      { defer: true },
    ),
  );
  onCleanup(() => untrack(pipWindow)?.close());

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "column-part/set-open":
        setColumnPartOpen(event.column, event.part, event.open);
        return true;
      case "compose/draft-open": {
        const draft = composeDrafts().find((other) => other.id === event.id);
        if (draft?.target) setDraftDialog(draft);
        return true;
      }
      case "deck/open-panel":
      case "deck/open-search":
      case "deck/open-column-picker":
      case "deck/toggle-panel":
      case "deck/close-panel":
      case "deck/select-column":
      case "deck/drag-start":
      case "deck/drag-move":
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
        const dragging = ui.dragging;
        if (!dragging) return true;
        // 見せている並びを変えずに確定する。先に掴みを外すと、保存が返るまでの間だけ元の並びに戻って見える。
        updateDeck((deck) => moveColumnToIn(deck, dragging.id, dragging.to));
        applyUi({ type: "deck/drag-end" });
        return true;
      }
      case "deck/move-column":
        updateDeck((deck) => moveColumnIn(deck, event.id, event.direction));
        return true;
      case "deck/add-column":
        addColumn(event.column);
        return true;
      case "deck/patch-column":
        updateDeck((deck) => updateColumnIn(deck, event.id, event.patch));
        return true;
      case "deck/pop-out": {
        // 押した操作の中で開かないとブラウザが断るので、待たずにすぐ呼ぶ。
        const opening = openPipWindow("Streets");
        const id = event.id;
        void opening.then(
          (win) => {
            const previous = pipWindow();
            // 先に覚えてから窓を渡す。逆だと、窓が替わった瞬間に前のカラムの置き場が中身を描き直す。
            applyUi({ type: "deck/popped-out", id });
            setPipWindow(win);
            if (previous && previous !== win) previous.close();
            win.addEventListener(
              "pagehide",
              () => {
                // 開き直したときは、前の窓が閉じた知らせが後から届く。
                if (pipWindow() !== win) return;
                setPipWindow(undefined);
                applyUi({ type: "deck/popped-in" });
              },
              { once: true },
            );
          },
          (cause: unknown) =>
            notifyError(cause, "ピクチャーインピクチャーを開けませんでした"),
        );
        return true;
      }
      case "deck/pop-in":
        pipWindow()?.close();
        return true;
      case "deck/remove-column":
        updateDeck((deck) => removeColumnFrom(deck, event.id));
        applyUi({ type: "deck/column-removed", id: event.id });
        return true;
      case "deck/switch-deck":
        // パネルは閉じない。選び直したデッキのカラムを、そのまま続けて並べ替えられる。
        switchDeck(event.id);
        return true;
      case "deck/add-deck": {
        const id = crypto.randomUUID();
        deckStore.update((set) =>
          addDeck(set, {
            id,
            name: event.name,
            columns:
              event.from === "copy"
                ? activeDeck(set, activeDeckId()).columns
                : defaultColumns(WELCOME_RELAYS),
          }),
        );
        if (deckStore.value()?.decks.some((deck) => deck.id === id)) {
          switchDeck(id);
          applyUi({ type: "deck/open-panel", panel: "arrange" });
        }
        return true;
      }
      case "deck/rename-deck":
        deckStore.update((set) => renameDeck(set, event.id, event.name));
        return true;
      case "deck/move-deck":
        deckStore.update((set) => moveDeckTo(set, event.id, event.to));
        return true;
      case "deck/remove-deck":
        deckStore.update((set) => removeDeck(set, event.id));
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
      case "deck/open-temp":
        navigate(`/${event.entity}`);
        return true;
      case "deck/focus-column":
        focusColumn(event.id);
        return true;
      case "deck/press-column":
        columnHeaders.get(event.id)?.();
        return true;
      case "deck/open-settings":
      case "deck/close-settings":
      case "deck/open-palette":
      case "deck/close-palette":
      case "deck/open-about":
      case "deck/close-about":
        applyUi(event);
        return true;
      case "deck/start-tour":
        // 「Streets について」から始めたときは、ダイアログを閉じてから指す。
        applyUi({ type: "deck/close-about" });
        requestAnimationFrame(startTour);
        return true;
      case "deck/set-color-scheme":
        measureUntilPaint("appearance.apply", "ui.theme");
        setScheme(event.scheme);
        setColorScheme(event.scheme);
        return true;
      case "deck/preview-ui-contrast":
        // theme-color の同期は離したときだけ。
        setContrast(event.contrast);
        applyUiContrast(event.contrast, false);
        return true;
      case "deck/set-ui-contrast":
        measureUntilPaint("appearance.apply", "ui.theme");
        setContrast(event.contrast);
        setUiContrast(event.contrast);
        return true;
      case "deck/preview-appearance":
        // 動かしている最中。画面にだけ当てる。
        measureUntilPaint("appearance.apply", "ui.theme");
        setAppearance(event.appearance);
        return true;
      case "deck/logout":
        props.session.logout();
        return true;
      case "deck/login":
        showLogin(event.what);
        return true;
      case "deck/browse": {
        let id = browseTargetIn(columns());
        if (id === undefined) {
          // 読めるカラムを全部外していたら、入口のリレーを紹介のすぐ右に足し直す。
          const column = buildRelayColumn(WELCOME_RELAYS);
          if (!column) return true;
          id = column.id;
          const welcomeAt = columns().findIndex(
            (item) => item.source.kind === "welcome",
          );
          updateDeck((deck) =>
            moveColumnToIn(addColumnTo(deck, column), column.id, welcomeAt + 1),
          );
        }
        const target = id;
        requestAnimationFrame(() => focusColumn(target));
        return true;
      }
      case "deck/set-write-progress":
        setShowWriteProgress(event.on);
        return true;
      case "deck/set-image-downscaling":
        setImageDownscaling(event.on);
        return true;
      case "deck/set-content-warning":
        setContentWarningMode(event.mode);
        return true;
      case "deck/set-deck-layout":
        setDeckLayout(event.layout);
        return true;
      case "deck/set-chat-order":
        setChatOrder(event.order);
        return true;
      case "deck/set-time-format":
        setTimeFormat(event.format);
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
      case "deck/set-column-stretch":
        setColumnStretch(event.on);
        return true;
      case "deck/set-default-reaction":
        setDefaultReaction(event.input);
        return true;
      case "deck/set-action-layout":
        setActionLayout(event.layout);
        return true;
      case "deck/set-error-report":
        setErrorReport(event.on);
        // 止めたらその場で送るのをやめ、戻したらもう一度用意する。
        void startTelemetry();
        return true;
      case "deck/set-client-tag":
        savedNotice = "プライバシーの設定を保存しました";
        deckStore.update((set) => ({ ...set, clientTag: event.on }));
        return true;
      case "deck/set-notify-quoted":
        savedNotice = "プライバシーの設定を保存しました";
        deckStore.update((set) => ({ ...set, notifyQuoted: event.on }));
        return true;
      case "deck/set-appearance":
        measureUntilPaint("appearance.apply", "ui.theme");
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
    <Switch>
      <Match when={shownPanel() === "compose"}>
        <SidePanel
          title="投稿する"
          icon="i-material-symbols:edit-square-outline-rounded"
          full={full}
        >
          <ComposeMediator
            send={(text, media, emoji, contentWarning) =>
              actions.post(text, media, emoji, contentWarning)
            }
            failure="投稿できませんでした"
            onSent={() => handle({ type: "deck/close-panel" })}
            drafts
          >
            {(state) => <ComposePanel state={state} drafts={composeDrafts()} />}
          </ComposeMediator>
        </SidePanel>
      </Match>
      <Match when={shownPanel() === "search"}>
        <SidePanel
          title="検索する"
          icon="i-material-symbols:search-rounded"
          full={full}
        >
          <SearchPanel
            readLayer={props.readLayer}
            signedIn={account !== undefined}
            searchRelays={shared.searchRelays}
            followees={followees}
            request={ui.searchRequest}
          />
        </SidePanel>
      </Match>
      <Match when={shownPanel() === "add-column"}>
        <SidePanel
          title={`「${currentDeck()?.name ?? ""}」にカラムを追加`}
          icon="i-material-symbols:add-rounded"
          full={full}
          onBack={() => handle({ type: "deck/open-panel", panel: "arrange" })}
        >
          <AddColumnPanel
            relayList={relayList()}
            readLayer={props.readLayer}
            searchRelays={shared.searchRelays}
            request={ui.columnPickerRequest}
          />
        </SidePanel>
      </Match>
      <Match when={shownPanel() === "arrange"}>
        <SidePanel
          title="デッキを編集する"
          icon="i-material-symbols:view-column-outline-rounded"
          full={full}
        >
          <ColumnArrangePanel
            columns={columns()}
            dragging={ui.dragging}
            header={
              <DeckEditHeader
                decks={deckSummaries()}
                activeId={currentDeck()?.id ?? ""}
              />
            }
          />
        </SidePanel>
      </Match>
      <Match when={shownPanel() === "new-deck" && deckStore.value()}>
        {(set) => (
          <SidePanel
            title="新しいデッキ"
            icon="i-material-symbols:view-column-outline-rounded"
            full={full}
            onBack={() => handle({ type: "deck/open-panel", panel: "arrange" })}
          >
            <NewDeckPanel
              placeholder={nextDeckName(set())}
              current={currentDeck()?.name ?? ""}
            />
          </SidePanel>
        )}
      </Match>
    </Switch>
  );

  // カラムごとに、見えているカラムが自分の入力欄を持つか。重ねた段はカラムの中に
  // 閉じているので、カラムから知らせてもらう。
  const [ownComposer, setOwnComposer] = createStore<Record<string, boolean>>(
    {},
  );
  const activeHasComposer = () =>
    ui.active !== undefined &&
    ui.settingsFor !== ui.active &&
    ownComposer[ui.active] === true;
  const shared = {
    registerHeader: (id: string, press: () => void) => {
      columnHeaders.set(id, press);
      return () => {
        if (columnHeaders.get(id) === press) columnHeaders.delete(id);
      };
    },
    onShown: (id: string, shown: ColumnDef) =>
      setOwnComposer(id, columnView(shown.source).ownComposer === true),
    get readLayer() {
      return props.readLayer;
    },
    viewer,
    signedIn: account !== undefined,
    followees,
    relayList,
    bookmarks: actions.bookmarkIds,
    // 検索の問い合わせ先。設定（kind:10007）を変えたら、次の購読から効く。
    // 開発時の ?relays= では、検索も差し替えた先へ聞く（外の既定の検索リレーへ行かない）。
    searchRelays: () =>
      props.bootstrapIndexers ?? effectiveSearchRelays(write?.searchRelays()),
  };

  const body = () => (
    <>
      <Switch>
        <Match when={warmUp.error}>
          <p role="alert" class="c-danger p-4 text-caption">
            フォローリストを取得できませんでした。
          </p>
        </Match>
        <Match when={deckStore.value() === undefined}>
          <p class="c-secondary p-4 text-caption">デッキを読み込み中…</p>
        </Match>
        <Match when={isMultiColumn()}>
          <div class="safe-pad-x flex h-dvh">
            <Sidebar
              pubkey={account}
              columns={order.shown()}
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
              {/* 並べ替えで測る位置の基準にするため、位置を持たせる。 */}
              <div
                ref={columnsEl}
                class="relative flex min-h-0 flex-1 overflow-x-auto bg-tertiary"
                onPointerDown={(event) => {
                  const target = event.target;
                  if (!(target instanceof Element)) {
                    return;
                  }
                  const grip = target.closest("[data-column-grip]");
                  if (!grip || target.closest("[data-no-grip]")) {
                    return;
                  }
                  const id =
                    grip.closest<HTMLElement>("[data-column-id]")?.dataset
                      .columnId;
                  if (id) deckSort.onPointerDown(id, event);
                }}
              >
                <Show when={temp()}>
                  {(column) => (
                    <div class="order-first h-full w-95 shrink-0 border-primary border-r">
                      <Column
                        column={column()}
                        settingsOpen={false}
                        temporary
                        {...shared}
                      />
                    </div>
                  )}
                </Show>
                <Show when={!temp() && params.entity}>
                  {(entity) => (
                    <div class="order-first h-full w-95 shrink-0 border-primary border-r bg-primary">
                      <UnreadableLink entity={entity()} />
                    </div>
                  )}
                </Show>
                <For each={order.mounted()}>
                  {(column) => (
                    <>
                      {/* 掴んだカラムは隣の上を通るので、帯の中でだけ上に重ねる。 */}
                      <div
                        data-column-id={column.id}
                        data-tour={
                          order.ids()[0] === column.id ? "columns" : undefined
                        }
                        class="h-full border-primary border-r data-[dragging]:z-1 data-[dragging]:shadow-[0_10px_30px_rgba(0,0,0,0.28)] dark:data-[dragging]:shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
                        style={{
                          ...columnWidthStyle(column.width, columnStretch()),
                          order: order.indexOf(column.id) * 2,
                        }}
                      >
                        <Column
                          column={column}
                          settingsOpen={ui.settingsFor === column.id}
                          poppedOut={
                            ui.poppedOut === column.id ? pipWindow() : undefined
                          }
                          grip
                          {...shared}
                        />
                      </div>
                      <Collapsible.Root
                        lazyMount
                        unmountOnExit
                        open={ui.settingsFor === column.id}
                        class="bg-secondary"
                        style={{
                          order: order.indexOf(column.id) * 2 + 1,
                        }}
                      >
                        <Collapsible.Content class="motion-collapse-right h-full overflow-hidden">
                          <div
                            data-settings-for={column.id}
                            class="h-full w-95 shrink-0 border-primary border-r"
                          >
                            <ColumnSettingsPanel
                              column={column}
                              signedIn={account !== undefined}
                              relayList={relayList()}
                              stretch={columnStretch()}
                            />
                          </div>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    </>
                  )}
                </For>
                {/* 広げるときは右端まで埋めたいので、トーストの場所は空けない。 */}
                <Show when={!columnStretch()}>
                  <DeckEndSpace />
                </Show>
              </div>
            </div>
          </div>
        </Match>
        <Match when={true}>
          <div class="safe-pad-x relative flex h-dvh flex-col pt-[env(safe-area-inset-top)]">
            <ColumnAccentBar
              temporary={ui.panel === undefined && ui.active === TEMP_COLUMN_ID}
            />
            <MobileTopBar
              pubkey={account}
              column={ui.panel === undefined ? activeColumn() : undefined}
              temporary={ui.active === TEMP_COLUMN_ID}
              settingsOpen={
                ui.active !== undefined && ui.settingsFor === ui.active
              }
              poppedOut={ui.active !== undefined && ui.poppedOut === ui.active}
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
                ref={mountStrip}
                class="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
                onScroll={onStripScroll}
              >
                <Show when={temp()}>
                  {(column) => (
                    <div
                      class="isolate h-full w-full shrink-0 snap-start snap-always"
                      style={{ order: stripOrder(TEMP_COLUMN_ID) }}
                    >
                      <Column
                        column={column()}
                        settingsOpen={false}
                        temporary
                        chrome={false}
                        {...shared}
                      />
                    </div>
                  )}
                </Show>
                <For each={order.mounted()}>
                  {(column) => (
                    <div
                      class="isolate h-full w-full shrink-0 snap-start snap-always"
                      style={{
                        order: stripOrder(column.id),
                      }}
                    >
                      <div
                        class="h-full"
                        classList={{
                          hidden: ui.settingsFor === column.id,
                        }}
                      >
                        <Column
                          column={column}
                          settingsOpen={ui.settingsFor === column.id}
                          poppedOut={
                            ui.poppedOut === column.id ? pipWindow() : undefined
                          }
                          chrome={false}
                          {...shared}
                        />
                      </div>
                      <Show when={ui.settingsFor === column.id}>
                        <div class="h-full">
                          <ColumnSettingsPanel
                            column={column}
                            signedIn={account !== undefined}
                            relayList={relayList()}
                          />
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
              <SidePanelMotion open={ui.panel !== undefined} full>
                {panelView(true)}
              </SidePanelMotion>
              {/* パネルや自分の入力欄を持つカラムを開いている間は、送信ボタンと重なるので出さない。紹介のカラムでも、ログインのボタンと重なるので出さない。 */}
              <Show
                when={
                  ui.panel === undefined &&
                  !activeHasComposer() &&
                  activeColumn()?.source.kind !== "welcome"
                }
              >
                <ComposeFab />
              </Show>
            </div>
            <MobileTabBar
              columns={order.shown()}
              temp={temp()}
              active={ui.panel === undefined ? ui.active : undefined}
              panel={ui.panel}
            />
          </div>
        </Match>
      </Switch>
      <Show when={draftDialog()} keyed>
        {(draft) => (
          <Show when={draft.target}>
            {(target) => (
              <TargetComposeDialog
                target={target()}
                initial={draft}
                onClose={() => setDraftDialog(undefined)}
              />
            )}
          </Show>
        )}
      </Show>
      <Show when={aboutMounted()}>
        <AboutDialog
          open={ui.aboutOpen}
          wide={isWide()}
          tour
          onOpenUser={(pubkey) => {
            handle({ type: "deck/close-about" });
            navigate(`/${encodeBech32("npub", pubkey)}`);
          }}
        />
      </Show>
      <Show when={tourRequests() > 0}>
        <DeckTour requests={tourRequests()} wide={isMultiColumn()} />
      </Show>
      <Show when={settingsMounted()}>
        <SettingsDialog
          open={ui.settingsOpen}
          signedIn={account !== undefined}
          wide={isWide()}
          scheme={scheme()}
          contrast={uiContrast()}
          appearance={appearance()}
          writeProgress={showWriteProgress()}
          errorReport={errorReport()}
          clientTag={clientTag()}
          notifyQuoted={notifyQuoted()}
          keymap={keymap()}
          columnDigits={columnDigits()}
          deckLayout={deckLayout()}
          columnStretch={columnStretch()}
          defaultReaction={defaultReaction()}
          requestedSetting={ui.settingsTarget}
        />
      </Show>
      <Show when={paletteMounted()}>
        <CommandPalette
          open={ui.paletteOpen}
          signedIn={account !== undefined}
          searchRelays={shared.searchRelays}
          decks={deckSummaries()}
        />
      </Show>
    </>
  );

  return (
    <EventActionsProvider value={actions}>
      <LoginGateProvider value={gate}>
        <Show
          when={write}
          fallback={
            <Mediates handle={handle}>
              <GuestMediator>
                <WelcomeLoginProvider value={welcomeLogin}>
                  {body()}
                </WelcomeLoginProvider>
              </GuestMediator>
            </Mediates>
          }
        >
          {(write) => (
            // デッキが裁定しなかった単発の操作（いいね・フォローなど）は、その外側が受ける。
            <ActionsMediator actions={write().actions}>
              <Mediates handle={handle}>
                <MediaMediator
                  writer={trackReplaces(write().writer, "画像のアップロード先")}
                  blossomList={write().blossomServers}
                  nip96List={write().nip96Servers}
                >
                  <SearchRelayMediator
                    writer={trackReplaces(write().writer, "検索するリレー")}
                    relayList={write().searchRelays}
                  >
                    <BlockedRelayMediator
                      writer={trackReplaces(write().writer, "繋がないリレー")}
                      signer={props.session.signer}
                      viewer={viewer}
                      list={write().blockedRelays}
                    >
                      <CustomEmojisMediator
                        writer={trackReplaces(write().writer, "自分の絵文字")}
                        list={write().emojiList}
                        fetchLatest={write().fetchLatest}
                      >
                        <UploaderProvider value={uploader}>
                          <ProfileMediator
                            writer={trackReplaces(
                              write().writer,
                              "プロフィール",
                            )}
                            pubkey={viewer}
                            profile={write().profile}
                          >
                            <RelayMediator
                              writer={trackReplaces(
                                write().writer,
                                "リレーの設定",
                              )}
                              relayList={write().relayList}
                              settled={write().relayListSettled}
                              statusOf={(url) =>
                                props.readLayer.manager.pool.statusOf(url)
                              }
                              readPlan={readPlan}
                              routingSettled={settled}
                              followees={followees}
                            >
                              <MuteMediator
                                writer={trackReplaces(
                                  write().writer,
                                  "ミュート",
                                )}
                                signer={props.session.signer}
                                viewer={viewer}
                                muteList={write().muteList}
                                settled={write().muteListSettled}
                              >
                                <FollowSetMediator
                                  writer={write().writer}
                                  signer={props.session.signer}
                                  viewer={viewer}
                                  manager={props.readLayer.manager}
                                >
                                  <ZapMediator
                                    signer={props.session.signer}
                                    viewer={viewer}
                                    store={props.readLayer.store}
                                    pool={props.readLayer.manager.pool}
                                    manager={props.readLayer.manager}
                                    routing={props.readLayer.routing}
                                    indexers={
                                      props.bootstrapIndexers ??
                                      BOOTSTRAP_INDEXERS
                                    }
                                  >
                                    <ChannelFormMediator
                                      actions={write().actions}
                                      account={() => {
                                        const state = relayList();
                                        return state.phase === "ready"
                                          ? state.entries
                                          : [];
                                      }}
                                    >
                                      <StatusFormMediator
                                        actions={write().actions}
                                      >
                                        {body()}
                                      </StatusFormMediator>
                                    </ChannelFormMediator>
                                  </ZapMediator>
                                </FollowSetMediator>
                              </MuteMediator>
                            </RelayMediator>
                          </ProfileMediator>
                        </UploaderProvider>
                      </CustomEmojisMediator>
                    </BlockedRelayMediator>
                  </SearchRelayMediator>
                </MediaMediator>
              </Mediates>
            </ActionsMediator>
          )}
        </Show>
      </LoginGateProvider>
    </EventActionsProvider>
  );
};

export default DeckScreen;
