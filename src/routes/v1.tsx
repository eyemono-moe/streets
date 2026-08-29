import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { Component } from "solid-js";
import type { ColumnDef } from "../core/deck/deck";
import { warmUpRouting } from "../core/read/bootstrap";
import { FALLBACK_RELAYS } from "../core/read/default-relays";
import { createIndexedDbPersistence } from "../core/read/indexeddb-persistence";
import { createReadLayer } from "../core/read/read-layer";
import { connectRelay } from "../core/relay/websocket-relay-connection";
import { createActiveSigner } from "../core/signer/active-signer";
import { createNip07Signer } from "../core/signer/nip07-signer";
import { parseBunkerUri } from "../core/signer/nip46/bunker-uri";
import type { Nip46Session } from "../core/signer/nip46/session";
import { connectNip46, restoreNip46 } from "../core/signer/nip46/session";
import {
  NIP46_SESSION_STORAGE_KEY,
  loadNip46Session,
  saveNip46Session,
} from "../core/signer/nip46/session-storage";
import { SignerUnavailableError } from "../core/signer/signer";
import { RenderProvider } from "../core/view/render-context";
import { fetchLatest } from "../core/write/fetch-latest";
import { type PublishResult, createPublisher } from "../core/write/publisher";
import { WriteFailedError, createWriter } from "../core/write/writer";
import Button from "../shared/components/UI/Button";
import AddColumnForm from "./v1/AddColumnForm";
import DeckColumn from "./v1/DeckColumn";
import DiagnosticsPanel from "./v1/DiagnosticsPanel";
import SettingsDialog from "./v1/SettingsDialog";
import {
  AccountSettingsProvider,
  createAccountSettings,
} from "./v1/account-settings";
import {
  addColumnTo,
  moveColumnIn,
  removeColumnFrom,
  renameColumnIn,
} from "./v1/deck-mutations";
import { DeckStoreProvider, createDeckStore } from "./v1/deck-store";
import {
  DeviceSettingsProvider,
  useDeviceSettings,
} from "./v1/device-settings";
import { EventActionsProvider, createEventActions } from "./v1/event-actions";
import { createFirstRenderRecorder } from "./v1/first-render-recorder";
import { MuteListProvider, createMuteList } from "./v1/mute-list";
import { parseRelays } from "./v1/parse-relays";
import { createProjectedWriter } from "./v1/projected-writer";
import { defaultRenderers } from "./v1/renderers";

/**
 * `?relays=` でローカルリレーへ上書きする (parse-relays.ts 参照)。
 * **既定は本物のリレー。** このクエリパラメータは e2e 専用の抜け道であり、
 * 通常このアプリがリレーをクエリ文字列から取ることはない —
 * debug ルートの `?budget=` と同じ立て付け。
 *
 * `DeckColumn` (`./v1/DeckColumn.tsx`) がカラムごとの `relays` 上書きに
 * 同じ計算をもう一度行っている —— こちらは manager/publisher の
 * fallbackRelays/indexers 用で、役割が違う値なのでモジュールをまたいで
 * 共有しない。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * `warm-up-phases` の表示専用フォーマット。未確定 ("-") のときだけ単位を
 * 落とす —— 他の診断値 (`warmUpMs` など) は列名自体が単位を兼ねるが、
 * こちらは "phase1: N ms / phase2: N ms" という文中表記のため、値が無い
 * ときに "- ms" と単位だけ浮かせない。
 */
const formatWarmUpPhaseMs = (ms: number | undefined): string =>
  ms === undefined ? "-" : `${ms.toFixed(2)} ms`;

/**
 * v1 の垂直スライス。ログイン → 1 カラム描画に続き、
 * ここでデッキと、localStorage cache + NIP-78 同期を組み立てる。
 *
 * **拡張機能の有無をマウント時に一度だけ確認して結果を保持する、という
 * ことはしない。** NIP-07 拡張は content script としてページ本体より
 * *後に* window.nostr を注入することがあり (nip07-signer.ts のコメント
 * 参照)、確認結果をシグナルに固定すると「後から入った拡張」を永久に
 * 見失う — signer-error が「拡張機能が見つかりません」を出したまま、
 * 実際には拡張が入っていても永久に更新されない、という壊れ方をする。
 * ログインボタンは常に表示し、クリックのたびに
 * createNip07Signer().getPublicKey() を呼んで、そのとき初めて拡張の
 * 有無を確かめる (SignerUnavailableError なら「見つからない」)。
 * nip07-signer.ts が「呼び出しのたびに読み直す」という同じ原則を、
 * ここでも UI 側で踏襲している。
 */
const V1Content: Component = () => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [bunkerUri, setBunkerUri] = createSignal("");
  const [authUrl, setAuthUrl] = createSignal<URL>();
  const activeSigner = createActiveSigner();
  let nip46Session: Nip46Session | undefined;
  onCleanup(() => nip46Session?.client.close());

  /**
   * pubkey が確定した時点から、いずれかのカラムに最初のノートが描画される
   * までの ms (task-5-brief.md Step 1, ADR-0011 の 2 秒予算の材料)。
   * `optimisticInsertMs` と同じ「診断用の常設表示、開発者モードの背後」の
   * 形をそのまま踏襲する。
   *
   * `loginStartMs` はシグナルにしない —— `login()` の中で一度書いたら
   * 読み返すのは `onColumnHasItems` だけで、Solid の依存追跡に乗せる理由が
   * 無い (`deckInitialized` と同じ「素の変数で足りる」ケース)。
   */
  let loginStartMs: number | undefined;
  const recordFirstRender = createFirstRenderRecorder();
  const [firstRenderMs, setFirstRenderMs] = createSignal<number>();
  const [firstRenderMsByColumn, setFirstRenderMsByColumn] = createSignal<
    Record<string, number>
  >({});
  /**
   * `DeckColumn` (3 カラムぶん) が `items()` が空でなくなるたびに呼ぶ
   * (`DeckColumn.tsx` の `onHasItems` 参照)。「最初の 1 回だけ記録する」判定
   * そのものは `recordFirstRender` (`first-render-recorder.ts`) に委ねている
   * ので、ここでは「pubkey がまだ無ければ無視する」ガードと
   * `setFirstRenderMs` への反映だけを行う。
   */
  const onColumnHasItems = (columnId: string) => {
    if (loginStartMs === undefined) return;
    const elapsed = performance.now() - loginStartMs;
    // カラム単位で持つ。デッキ全体の 1 つの数字は、ウォームアップを待たない
    // カラム (単一著者・明示リレー) の値になりがちで、ユーザーが実際に
    // 待っているカラムが予算外でも予算内に見える。
    setFirstRenderMsByColumn((prev) =>
      columnId in prev ? prev : { ...prev, [columnId]: elapsed },
    );
    const recorded = recordFirstRender(elapsed);
    if (recorded !== undefined) setFirstRenderMs(recorded);
  };

  // 保存形式とstate同期はDeviceSettingsProviderの内側に隠し、ここは
  // 診断表示の判定だけをinterface越しに読む。
  const { developerMode } = useDeviceSettings();
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  // 読み取り層の配線。debug/v1-section.tsx と同じ合成ルート
  // (`createReadLayer`, spec 9 節)。manager (= ConnectionPool)・store・
  // コアレッサは 3 カラムぶんのすべての `createSection` で共有する —
  // ADR-0011 の 30 接続予算はカラム単位ではなくアプリ全体の予算なので、
  // カラムごとに別の manager を持つと予算が意味を失う。`/v1` は本物の
  // IndexedDB persistence を使う (デバッグルートと違い、こちらは実際の
  // ユーザーが使う画面で、リロードのたびに取り直すコストを削るのが
  // このスライスの目的そのもの)。
  const readLayer = createReadLayer({
    connect: connectRelay,
    persistence: createIndexedDbPersistence(),
    // undefined なら SubscriptionManager 自身の既定 (FALLBACK_RELAYS) が効く
    fallbackRelays: RELAYS_OVERRIDE,
  });
  onCleanup(() => readLayer.dispose());
  const {
    store,
    routing,
    manager,
    profiles: profileRequests,
    events: eventRequests,
    engagements: engagementRequests,
  } = readLayer;

  // 書き込み経路。ソケットを開くのは manager と同じ
  // ConnectionPool (`manager.pool`) 一本化 —— publish 専用の別経路は
  // 持たない (Global constraints: 30 接続予算をもう一系統で穴あけしない)。
  const publisher = createPublisher({
    pool: manager.pool,
    routing,
    // undefined なら FALLBACK_RELAYS (SubscriptionManager/warmUpRouting と
    // 同じ既定) を使う。
    fallbackRelays: RELAYS_OVERRIDE ?? FALLBACK_RELAYS,
  });

  // 署名 → 楽観挿入 → publish → (全滅なら) 巻き戻し、を一本化した経路
  // (spec 4〜6 節)。signer は login() と同じ理由で毎回ではなく 1 度だけ
  // createNip07Signer() を呼んで持つ —— nip07-signer.ts の各メソッドは
  // 呼び出しのたびに window.nostr を読み直すので、生成を 1 度にまとめても
  // 「後から入った拡張を見失う」問題は起きない。fetchLatest は write リレー
  // から再取得する経路 (fetch-latest.ts) で、manager/store/routing を
  // 読み取り層と共有する (ConnectionPool を publish 専用にもう一系統
  // 持たないのと同じ理由)。
  const fetchLatestEvent = (
    kind: number,
    identifier: string | undefined,
    author: string,
  ) =>
    fetchLatest(
      {
        pool: manager.pool,
        routing,
        store,
        fallbackRelays: RELAYS_OVERRIDE ?? FALLBACK_RELAYS,
      },
      kind,
      identifier,
      author,
    );

  const writer = createWriter({
    signer: activeSigner,
    store,
    publisher,
    pubkey: () => {
      const pk = pubkey();
      if (!pk) throw new SignerUnavailableError();
      return pk;
    },
    fetchLatest: fetchLatestEvent,
  });
  const projectedWriter = createProjectedWriter(writer, store);
  onCleanup(() => projectedWriter.dispose());
  const eventActions = createEventActions({ writer: projectedWriter, store });

  // pubkey が undefined の間 (ログイン前) は createResource がフェッチャーを
  // 呼ばない — デバッグルートのような「空文字を弾く」ガードが要らない
  // (source が nullish なら Solid 自身が起動を見送るため)。
  // ブートストラップは kind:3 を引いてから kind:10002 を引く 2 往復で、
  // ホーム列の最初の REQ はその後にしか出せない。初回描画のどれだけを
  // ここが占めているかは、first-render-ms からこれを引いて初めて分かる。
  const [warmUpMs, setWarmUpMs] = createSignal<number>();
  const [warmUp] = createResource(pubkey, async (pk) => {
    // 水和 (readLayer.ready) を待たずに warmUpRouting を走らせると、相②が
    // まだ空の store を見て「キャッシュは無い」と誤判定し、全フォロイーぶん
    // 取り直してしまう —— このスライスが削るはずだったコストがそのまま
    // 復活する (spec 9 節)。計測 (startedAt) はこの待ちの外に置く:
    // warmUpMs は indexer との往復コストの内訳であって、ローカル DB の
    // 読み出し待ちを混ぜると同じ数値が「速い warmUp」と「速い水和」の
    // どちらを指しているか分からなくなる。
    await readLayer.ready;
    const startedAt = performance.now();
    try {
      return await warmUpRouting({
        pubkey: pk,
        // マネージャと同じ ConnectionPool を使う (ADR-0011 の予算を一本化する)
        store,
        pool: manager.pool,
        // undefined なら warmUpRouting 自身の既定 (BOOTSTRAP_INDEXERS) が効く
        indexers: RELAYS_OVERRIDE,
      });
    } finally {
      setWarmUpMs(performance.now() - startedAt);
    }
  });

  const accountSettings = createAccountSettings({
    pubkey,
    relayListSettled: () =>
      warmUp.state === "ready" || warmUp.state === "errored",
    store,
    writer,
  });
  const deckStore = createDeckStore({
    pubkey,
    routingSettled: () =>
      warmUp.state === "ready" || warmUp.state === "errored",
    signer: activeSigner,
    writer,
    fetchLatest: fetchLatestEvent,
    storage: window.localStorage,
  });

  // 4 つの操作本体 (`Deck → Deck`) は ./v1/deck-mutations.ts の純関数に
  // 委ねている。ここでの役目は「現在のデッキを読む」→「純関数を適用する」
  // →「変化していれば updateDeck へ渡す」の 3 段だけ。変化の有無を参照
  // 比較で見ているのは、`moveColumnIn`/`renameColumnIn` が変化なしのとき
  // 入力の `deck` をそのまま (同一参照で) 返す契約になっているため ——
  // これにより端での移動や空タイトルでの改名が無駄な localStorage 書き込み
  // を起こさない。
  const addColumn = (column: ColumnDef) => {
    deckStore.update((current) => addColumnTo(current, column));
  };

  const removeColumn = (id: string) => {
    deckStore.update((current) => removeColumnFrom(current, id));
  };

  const moveColumn = (id: string, direction: -1 | 1) => {
    deckStore.update((current) => moveColumnIn(current, id, direction));
  };

  const renameColumn = (id: string, title: string) => {
    deckStore.update((current) => renameColumnIn(current, id, title));
  };

  // manager.connectionCount / peakConnectionCount はシグナルではないので
  // JSX へ直接置いても更新されない (debug/v1-section.tsx と同じ理由)。
  // 3 カラムぶんの購読が同じ manager (= 同じ ConnectionPool) を共有して
  // いるので、ここに出るのは 3 カラム合計の接続数 —— 30 接続予算が
  // 3 カラム + プロフィール + 投稿で成立するかという問い (仕様 10 節
  // 問い 2) の材料。setInterval によるポーリングは、デバッグルートと
  // 同じく「pool 側だけで完結する変化を取り逃さない」ための保険。
  const [connections, setConnections] = createSignal(manager.connectionCount);
  const [peakConnections, setPeakConnections] = createSignal(
    manager.peakConnectionCount,
  );
  // manager.unrequestedEventsByRelay も同じ理由でシグナルではない
  // (copy-on-read の ReadonlyMap, subscription-manager.ts 参照)。今まで
  // どこにも表示先が無かった値 —— 開発者モード (DiagnosticsPanel) ができて
  // 初めて置き場所ができた。debug/v1-section.tsx と同じく [url, count][]
  // に写して保持する。
  const [unrequestedEventsByRelay, setUnrequestedEventsByRelay] = createSignal<
    [string, number][]
  >([]);
  const [verifyStats, setVerifyStats] = createSignal({ ms: 0, count: 0 });
  const [batchSizes, setBatchSizes] = createSignal({
    events: { last: 0, max: 0 },
    profiles: { last: 0, max: 0 },
    engagements: { last: 0, max: 0 },
  });
  const syncConnectionSignals = () => {
    setVerifyStats({ ms: store.verifyMs, count: store.verifyCount });
    setBatchSizes({
      events: {
        last: eventRequests.lastBatchSize,
        max: eventRequests.maxBatchSize,
      },
      profiles: {
        last: profileRequests.lastBatchSize,
        max: profileRequests.maxBatchSize,
      },
      // 仕様 9 節 問い 1 (`#e` のコアレッサが 1 バッチで何件になるか) を
      // 実鍵で測れるようにするための表示。
      engagements: {
        last: engagementRequests.lastBatchSize,
        max: engagementRequests.maxBatchSize,
      },
    });
    setConnections(manager.connectionCount);
    setPeakConnections(manager.peakConnectionCount);
    setUnrequestedEventsByRelay([...manager.unrequestedEventsByRelay]);
  };
  createEffect(() => {
    warmUp();
    syncConnectionSignals();
  });
  const connectionsInterval = setInterval(syncConnectionSignals, 1_000);
  onCleanup(() => clearInterval(connectionsInterval));

  const login = async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const signer = createNip07Signer();
      const pk = await signer.getPublicKey();
      // 「pubkey が確定した時点」はここ (`setPubkey` の直前) —— 拡張機能の
      // 応答待ち (`getPublicKey()`) を測定区間に含めない。first-render-ms が
      // 見たいのはログイン後の描画コストであり、拡張機能側の待ち時間まで
      // 混ぜると何のボトルネックを指しているか分からなくなる。
      loginStartMs = performance.now();
      nip46Session?.client.close();
      nip46Session = undefined;
      window.localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
      activeSigner.set(signer);
      setPubkey(pk);
    } catch (error) {
      setErrorMessage(
        error instanceof SignerUnavailableError
          ? "拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等) を導入するか、bunker でログインしてください。"
          : `ログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const activateNip46 = (session: Nip46Session) => {
    nip46Session?.client.close();
    nip46Session = session;
    activeSigner.set(session.signer);
    loginStartMs = performance.now();
    setPubkey(session.userPubkey);
    window.localStorage.setItem(
      NIP46_SESSION_STORAGE_KEY,
      saveNip46Session(session.stored),
    );
  };

  const nip46Hooks = {
    onAuthUrl: (url: URL | undefined) => setAuthUrl(url),
  };

  const loginWithBunker = async () => {
    setLoading(true);
    setErrorMessage(undefined);
    setAuthUrl(undefined);
    try {
      const session = await connectNip46({
        pool: manager.pool,
        bunker: parseBunkerUri(bunkerUri()),
        hooks: nip46Hooks,
        metadataUrl: window.location.origin,
      });
      activateNip46(session);
      setBunkerUri("");
    } catch (error) {
      setErrorMessage(
        `リモート署名器への接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    const raw = window.localStorage.getItem(NIP46_SESSION_STORAGE_KEY);
    const stored = loadNip46Session(raw);
    if (!stored) {
      if (raw !== null) {
        window.localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
        setErrorMessage(
          "リモート署名器の必要権限が更新されました。新しい bunker URI で再接続し、デッキ同期と操作に必要な権限を承認してください。",
        );
      }
      return;
    }
    setLoading(true);
    void restoreNip46({ pool: manager.pool, stored, hooks: nip46Hooks })
      .then(activateNip46)
      .catch(() => {
        window.localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
        setErrorMessage(
          "リモート署名器との接続を復元できませんでした。新しい bunker URI で接続してください。",
        );
      })
      .finally(() => setLoading(false));
  });

  const logout = async () => {
    const session = nip46Session;
    activeSigner.set(undefined);
    nip46Session = undefined;
    setPubkey(undefined);
    setAuthUrl(undefined);
    window.localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
    if (!session) return;
    try {
      await Promise.race([
        session.client.request("logout"),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    } catch {
      // logout RPC は courtesy hint。ローカル資格情報は上で既に削除している。
    } finally {
      session.client.close();
    }
  };

  // 投稿フォーム。
  const [content, setContent] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [postError, setPostError] = createSignal<string>();
  const [publishResult, setPublishResult] = createSignal<PublishResult>();

  /**
   * **順序が重要 (仕様 6 節)**: 署名 → EventStore への挿入 (楽観的更新) →
   * publish。署名を拒否された場合 (NIP-07 拡張が例外を投げる) はここで
   * catch に落ち、挿入も publish も一切実行されない —— 巻き戻す状態が
   * 存在しないのはこの順序を逆にしないからそのまま成り立つ。逆順 (先に
   * 挿入してから署名) だと、拒否されたときに挿入済みの投稿を消す処理が
   * 別途必要になる。
   */
  const postNote = async () => {
    const text = content().trim();
    const pk = pubkey();
    if (!text || !pk || posting()) return;

    setPosting(true);
    setPostError(undefined);
    setPublishResult(undefined);
    // onOptimisticInsert で本文をクリアしたかどうか。duplicate でも消すので
    // ProjectedWriter の楽観一覧へ追加されたかどうかとは分けて持つ。
    let clearedOptimistically = false;
    try {
      // Store とカラムへの楽観挿入は ProjectedWriter に一本化し、ここには
      // フォームをいつ消すかとエラー文言だけを残す。
      const result = await projectedWriter.publish(
        { kind: 1, tags: [], content: text },
        {
          onOptimisticInsert: () => {
            // 楽観挿入 (または重複判定) と同じタイミングでクリアする ——
            // publish の解決を待ってから消すと、"inserted" の場合は
            // ノート自体が挿入直後に画面へ出ているのに入力欄だけ
            // 最大 PUBLISH_TIMEOUT_MS 分の間古い文面を残し、送れたのか
            // 疑わせる空白ができる。失敗時は下の catch で元の文面に戻す
            // (「本文は残す」という挙動そのものは変えない)。
            setContent("");
            clearedOptimistically = true;
          },
        },
      );
      setPublishResult(result);
    } catch (error) {
      if (error instanceof WriteFailedError) {
        // 本文は残す —— 送れなかった文面を打ち直させないため。
        // onOptimisticInsert で先にクリアしていた場合はここで書き戻す。
        if (clearedOptimistically) setContent(text);
        setPostError(
          `どのリレーにも届きませんでした (${error.rejected.length} 本が拒否)`,
        );
      } else if (error instanceof SignerUnavailableError) {
        setPostError("拡張機能が見つかりません。");
      } else {
        setPostError(
          `投稿に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      setPosting(false);
    }
  };

  const renderView = () => (
    <div class="flex h-100dvh w-screen flex-col overflow-hidden">
      <header class="shrink-0 space-y-2 border-alpha-300 border-b p-3">
        <div class="flex items-center justify-between gap-2">
          <h1 class="font-bold text-lg">v1 プレビュー</h1>
          <Button
            aria-haspopup="dialog"
            data-testid="settings-open"
            variant="border"
            onClick={() => setSettingsOpen(true)}
          >
            設定
          </Button>
        </div>

        <Show
          when={!pubkey()}
          fallback={
            <div class="flex flex-wrap items-center gap-3">
              <p
                data-testid="viewer-pubkey"
                class="break-all rounded-2 border border-alpha-300 bg-alpha-50 p-2 text-xs"
              >
                {pubkey()}
              </p>
              <Button
                data-testid="logout"
                variant="border"
                onClick={() => void logout()}
              >
                ログアウト
              </Button>
              <Show
                when={
                  deckStore.state().phase === "error" ||
                  deckStore.state().phase === "conflict"
                }
              >
                <Button
                  data-testid="deck-sync-attention"
                  variant="border"
                  onClick={() => setSettingsOpen(true)}
                >
                  デッキの同期を確認
                </Button>
              </Show>
              {/*
                ADR-0026: connections/peakConnections/optimisticInsertMs/
                unrequestedEventsByRelay はどれも行動できない診断値であり、
                開発者モードが有効なときだけ出す。値の計算 (syncConnectionSignals)
                自体は開発者モードの有無に関わらず常に続く —— 隠れるのは
                表示だけ (ADR-0011 の改訂で撤回されなかった要件)。
              */}
              <DiagnosticsPanel visible={developerMode}>
                <div class="flex flex-wrap items-center gap-3">
                  <p data-testid="connections" class="text-alpha-600 text-xs">
                    connections: {connections()}
                  </p>
                  <p
                    data-testid="peak-connections"
                    class="text-alpha-600 text-xs"
                  >
                    peakConnections: {peakConnections()}
                  </p>
                  <p
                    data-testid="optimistic-insert-ms"
                    class="text-alpha-600 text-xs"
                  >
                    optimisticInsertMs:{" "}
                    {projectedWriter.optimisticInsertMs() === undefined
                      ? "-"
                      : projectedWriter.optimisticInsertMs()?.toFixed(2)}
                  </p>
                  <p
                    data-testid="first-render-ms"
                    class="text-alpha-600 text-xs"
                  >
                    firstRenderMs:{" "}
                    {firstRenderMs() === undefined
                      ? "-"
                      : firstRenderMs()?.toFixed(2)}
                  </p>
                  <p data-testid="warm-up-ms" class="text-alpha-600 text-xs">
                    warmUpMs:{" "}
                    {warmUpMs() === undefined ? "-" : warmUpMs()?.toFixed(2)}
                  </p>
                  {/*
                    warmUpMs (上) は warmUpRouting() 全体で、こちらはその
                    内訳。ウォームアップは 2 相あり、相② (全フォロイーの
                    kind:10002) だけがフォロー数に比例する —— どちらが
                    支配的かで、キャッシュして意味のある相が変わる。
                    warmUp() が確定するまでは両方とも "-"。
                  */}
                  <p
                    data-testid="warm-up-phases"
                    class="text-alpha-600 text-xs"
                  >
                    phase1: {formatWarmUpPhaseMs(warmUp()?.phase1Ms)} / phase2:{" "}
                    {formatWarmUpPhaseMs(warmUp()?.phase2Ms)}
                  </p>
                  {/*
                    相の所要時間は**最も遅い 1 本**で決まるので、合計値だけでは
                    どのリレーが原因かも、そもそも応答が返っていないのかも
                    分からない。遅い順に並べる。
                  */}
                  <ul
                    data-testid="warm-up-relays"
                    class="text-alpha-600 text-xs"
                  >
                    <For
                      each={[
                        ...(warmUp()?.phase1Relays ?? []).map(
                          (s) => ["1", s] as const,
                        ),
                        ...(warmUp()?.phase2Relays ?? []).map(
                          (s) => ["2", s] as const,
                        ),
                      ].sort((a, b) => b[1].ms - a[1].ms)}
                    >
                      {([phase, settle]) => (
                        <li data-testid="warm-up-relay">
                          p{phase} {settle.ms.toFixed(0)}ms {settle.reason}{" "}
                          {settle.url}
                        </li>
                      )}
                    </For>
                  </ul>
                  <p data-testid="verify-ms" class="text-alpha-600 text-xs">
                    verifyMs: {verifyStats().ms.toFixed(2)} (
                    {verifyStats().count} 件)
                  </p>
                  <p data-testid="event-batch" class="text-alpha-600 text-xs">
                    eventBatch: {batchSizes().events.last} (max{" "}
                    {batchSizes().events.max})
                  </p>
                  <p data-testid="profile-batch" class="text-alpha-600 text-xs">
                    profileBatch: {batchSizes().profiles.last} (max{" "}
                    {batchSizes().profiles.max})
                  </p>
                  <p
                    data-testid="engagement-batch"
                    class="text-alpha-600 text-xs"
                  >
                    engagementBatch: {batchSizes().engagements.last} (max{" "}
                    {batchSizes().engagements.max})
                  </p>
                  <ul
                    data-testid="unrequested-relays"
                    class="text-alpha-600 text-xs"
                  >
                    <For each={unrequestedEventsByRelay()}>
                      {([url, count]) => (
                        <li data-testid="unrequested-relay">
                          {url} = {count}
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </DiagnosticsPanel>
            </div>
          }
        >
          <div class="flex max-w-xl flex-col gap-3">
            <Button data-testid="login" disabled={loading()} onClick={login}>
              {loading() ? "確認中…" : "NIP-07 でログイン"}
            </Button>

            <form
              class="flex flex-col gap-2 rounded-2 border border-alpha-300 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void loginWithBunker();
              }}
            >
              <label for="bunker-uri" class="text-sm">
                リモート署名器でログイン
              </label>
              <p class="text-alpha-600 text-xs">
                秘密鍵ではなく、署名器が発行した bunker://
                から始まる接続情報を貼り付けてください。
              </p>
              <input
                id="bunker-uri"
                data-testid="bunker-uri"
                type="password"
                autocomplete="off"
                spellcheck={false}
                class="rounded-2 border border-alpha-300 bg-alpha-50 p-2 text-sm"
                value={bunkerUri()}
                onInput={(event) => setBunkerUri(event.currentTarget.value)}
              />
              <Button
                data-testid="bunker-login"
                type="submit"
                disabled={loading() || bunkerUri().trim() === ""}
              >
                {loading() ? "接続中…" : "bunker でログイン"}
              </Button>
            </form>
          </div>

          <Show when={errorMessage()}>
            {(message) => (
              <p
                data-testid="signer-error"
                class="rounded-2 border border-red-6 bg-red-4/10 p-3 text-red-8 text-sm dark:text-red-4"
              >
                {message()}
              </p>
            )}
          </Show>
        </Show>

        <Show when={authUrl()}>
          {(url) => (
            <p class="rounded-2 border border-yellow-6 bg-yellow-4/10 p-3 text-sm">
              リモート署名器で追加の承認が必要です。{" "}
              <a
                data-testid="nip46-auth-url"
                class="underline"
                href={url().toString()}
                target="_blank"
                rel="noopener noreferrer"
              >
                承認画面を開く
              </a>
            </p>
          )}
        </Show>
      </header>

      <Show when={settingsOpen()}>
        <AccountSettingsProvider value={accountSettings}>
          <SettingsDialog onClose={() => setSettingsOpen(false)} />
        </AccountSettingsProvider>
      </Show>

      <Show when={pubkey()}>
        <form
          data-testid="composer"
          class="flex shrink-0 items-start gap-2 border-alpha-300 border-b p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void postNote();
          }}
        >
          <textarea
            data-testid="composer-input"
            class="min-h-16 flex-1 resize-y rounded-2 border border-alpha-300 bg-alpha-50 p-2 text-sm"
            placeholder="いまどうしてる?"
            disabled={posting()}
            value={content()}
            onInput={(event) => setContent(event.currentTarget.value)}
          />
          <Button
            data-testid="composer-submit"
            type="submit"
            disabled={posting() || content().trim().length === 0}
          >
            {posting() ? "投稿中…" : "投稿"}
          </Button>
        </form>

        <Show when={postError()}>
          {(message) => (
            <p
              data-testid="post-error"
              class="shrink-0 border-alpha-300 border-b bg-red-4/10 p-2 text-red-8 text-xs dark:text-red-4"
            >
              {message()}
            </p>
          )}
        </Show>

        <Show when={publishResult()}>
          {(result) => (
            <p
              data-testid="publish-result"
              class="shrink-0 border-alpha-300 border-b p-2 text-alpha-600 text-xs"
            >
              publish: accepted={result().accepted.length} (
              {result().accepted.join(", ")}), rejected=
              {result().rejected.length}
              <Show when={result().rejected.length > 0}>
                {" "}
                (
                {result()
                  .rejected.map((r) => `${r.relay}: ${r.reason}`)
                  .join(", ")}
                )
              </Show>
            </p>
          )}
        </Show>

        <AddColumnForm onAdd={addColumn} />

        <Show
          when={(deckStore.value()?.columns.length ?? 0) > 0}
          fallback={
            <p
              data-testid="empty-deck"
              class="flex-1 p-3 text-alpha-600 text-sm"
            >
              + でカラムを追加してください
            </p>
          }
        >
          <div
            data-testid="deck"
            class="flex min-h-0 flex-1 divide-x overflow-x-auto"
          >
            {/*
              レンダラ (kind:1/6/16, spec 6 節) と EventView が共有する依存の
              束 (design 2.1 節)。3 カラムぶんまとめて 1 つの provider の下に
              置く —— カラムごとに別の値を渡す理由が無い (store/manager と
              同じ「アプリ全体で 1 つ」の単位)。
            */}
            <EventActionsProvider value={eventActions}>
              <RenderProvider
                value={{
                  store,
                  events: eventRequests,
                  profiles: profileRequests,
                  engagements: engagementRequests,
                  // getter で渡す —— オブジェクトリテラルの値は 1 度しか
                  // 評価されないため、`viewerPubkey: pubkey()` だと後から
                  // ログインしても RenderProvider に渡した値が追随しない。
                  get viewerPubkey() {
                    return pubkey();
                  },
                  renderers: defaultRenderers,
                }}
              >
                <For each={deckStore.value()?.columns ?? []}>
                  {(column, index) => (
                    <DeckColumn
                      column={column}
                      manager={manager}
                      followees={() => warmUp()?.followees ?? []}
                      viewer={pubkey() ?? ""}
                      relayList={accountSettings.relayList.current}
                      optimisticEvents={projectedWriter.optimisticEvents}
                      onHasItems={() => onColumnHasItems(column.id)}
                      firstRenderMs={() => firstRenderMsByColumn()[column.id]}
                      canMoveLeft={() => index() > 0}
                      canMoveRight={() =>
                        index() < (deckStore.value()?.columns.length ?? 0) - 1
                      }
                      onMoveLeft={() => moveColumn(column.id, -1)}
                      onMoveRight={() => moveColumn(column.id, 1)}
                      onRemove={() => removeColumn(column.id)}
                      onRename={(title) => renameColumn(column.id, title)}
                    />
                  )}
                </For>
              </RenderProvider>
            </EventActionsProvider>
          </div>
        </Show>
      </Show>
    </div>
  );
  return DeckStoreProvider({
    value: deckStore,
    get children() {
      return (
        <Show when={pubkey()} keyed fallback={renderView()}>
          {(account) => {
            // アカウントを key に Provider の所有者ごと作り直す。復号済みの
            // 非公開項目をログアウト後や次のアカウントへ持ち越さない。
            const muteList = createMuteList({
              pubkey: () => account,
              routingSettled: () =>
                warmUp.state === "ready" || warmUp.state === "errored",
              signer: activeSigner,
              store,
              writer,
              fetchLatest: fetchLatestEvent,
            });
            return MuteListProvider({
              value: muteList,
              get children() {
                return renderView();
              },
            });
          }}
        </Show>
      );
    },
  });
};

const V1: Component = () => (
  <DeviceSettingsProvider>
    <V1Content />
  </DeviceSettingsProvider>
);

export default V1;
