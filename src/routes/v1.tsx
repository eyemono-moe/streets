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
import { ColumnNavigationProvider } from "./v1/column-navigation";
import {
  buildFolloweesColumn,
  buildFollowersColumn,
  buildUserColumn,
} from "./v1/column-presets";
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
import { FollowStateProvider, createFollowState } from "./v1/follow-state";
import { MuteListProvider, createMuteList } from "./v1/mute-list";
import { parseRelays } from "./v1/parse-relays";
import { createProjectedWriter } from "./v1/projected-writer";
import { defaultRenderers } from "./v1/renderers";

/**
 * `?relays=` は e2e 専用にローカルリレーへ上書きする抜け道。`DeckColumn`
 * も同じ計算を独立に行うが、役割が違う値なので共有しない。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * `warm-up-phases` は列名でなく文中に埋め込むので、値が無いときは
 * "- ms" と単位だけ浮かせないよう "-" だけにする。
 */
const formatWarmUpPhaseMs = (ms: number | undefined): string =>
  ms === undefined ? "-" : `${ms.toFixed(2)} ms`;

/**
 * 拡張機能の有無は固定しない —— NIP-07 は本体より後に window.nostr を
 * 注入しうるので、マウント時にキャッシュすると後から入った拡張を見失う。
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
   * pubkey 確定から最初のノート描画までの ms (2 秒予算の材料)。
   * `login()` で書いて 1 箇所でしか読まないので素の変数で足りる。
   */
  let loginStartMs: number | undefined;
  const recordFirstRender = createFirstRenderRecorder();
  const [firstRenderMs, setFirstRenderMs] = createSignal<number>();
  const [firstRenderMsByColumn, setFirstRenderMsByColumn] = createSignal<
    Record<string, number>
  >({});
  /**
   * `DeckColumn` が items が空でなくなるたびに呼ぶ。「最初の 1 回だけ」の
   * 判定は `recordFirstRender` に委ね、ここは pubkey ガードと反映だけ行う。
   */
  const onColumnHasItems = (columnId: string) => {
    if (loginStartMs === undefined) return;
    const elapsed = performance.now() - loginStartMs;
    // カラム単位で持つ —— 全体の 1 つの数字だと待たないカラムの値に化けて予算超過を見逃す。
    setFirstRenderMsByColumn((prev) =>
      columnId in prev ? prev : { ...prev, [columnId]: elapsed },
    );
    const recorded = recordFirstRender(elapsed);
    if (recorded !== undefined) setFirstRenderMs(recorded);
  };

  // 保存とstate同期はDeviceSettingsProviderの内側に隠し、診断表示の判定だけをinterfaceで読む。
  const { developerMode } = useDeviceSettings();
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  // debug/v1-section.tsx と同じ配線。manager/store/コアレッサは 3 カラム
  // で共有する —— 30 接続予算はアプリ全体の予算でカラム単位ではない。
  // `/v1` は本物の IndexedDB persistence を使う (実画面なので再取得コストを削る)。
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

  // 書き込みも manager と同じ ConnectionPool を使う (`manager.pool`) ——
  // publish 専用の別経路を持つと 30 接続予算がもう一系統で穴あく。
  const publisher = createPublisher({
    pool: manager.pool,
    routing,
    // undefined なら FALLBACK_RELAYS (SubscriptionManager/warmUpRouting と同じ既定)。
    fallbackRelays: RELAYS_OVERRIDE ?? FALLBACK_RELAYS,
  });

  // 署名 → 楽観挿入 → publish → (全滅なら) 巻き戻しを一本化した経路。
  // signer は login() と同じ理由で 1 度だけ生成する (各メソッドが呼び出し
  // ごとに window.nostr を読み直すので、後から入った拡張も見失わない)。
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

  // pubkey が undefined の間は createResource が呼ばれない (nullish は
  // 起動を見送るので空文字ガードは不要)。ブートストラップは kind:3→
  // kind:10002 の 2 往復で、ホーム列の最初の REQ はその後にしか出せない。
  const [warmUpMs, setWarmUpMs] = createSignal<number>();
  const [warmUp] = createResource(pubkey, async (pk) => {
    // readLayer.ready を待たずに走らせると、相②が空の store を「キャッシュ
    // 無し」と誤判定し全フォロイーを取り直す。計測 (startedAt) はこの待ちの
    // 外に置く —— warmUpMs は indexer 往復のみを指し、水和待ちを混ぜない。
    await readLayer.ready;
    const startedAt = performance.now();
    try {
      return await warmUpRouting({
        pubkey: pk,
        // マネージャと同じ ConnectionPool を使う (接続予算を一本化する)
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
    profileRequests,
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

  // 4 操作は ./v1/deck-mutations.ts の純関数に委ね、ここは読む→適用する
  // →変化していれば updateDeck へ渡すだけ。`moveColumnIn`/`renameColumnIn`
  // は無変化なら同一参照を返す契約なので、参照比較で無駄な書き込みを防げる。
  const addColumn = (column: ColumnDef) => {
    deckStore.update((current) => addColumnTo(current, column));
  };
  const columnNavigation = {
    openUser: (target: string) => addColumn(buildUserColumn(target)),
    openFollowees: (target: string) => addColumn(buildFolloweesColumn(target)),
    openFollowers: (target: string) => addColumn(buildFollowersColumn(target)),
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

  // connectionCount/peakConnectionCount はシグナルではないので、
  // setInterval でポーリングして pool 側だけの変化も取り逃さないようにする。
  // ここに出るのは 3 カラム合計の接続数 (30 接続予算の妥当性を測る材料)。
  const [connections, setConnections] = createSignal(manager.connectionCount);
  const [peakConnections, setPeakConnections] = createSignal(
    manager.peakConnectionCount,
  );
  // unrequestedEventsByRelay も同じ理由でシグナルではない (copy-on-read の
  // ReadonlyMap)。debug/v1-section.tsx と同じく [url, count][] に写して保持する。
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
      // `#e` コアレッサの 1 バッチ件数を実鍵で測るための表示。
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
      // ここが「pubkey 確定」の基準点 —— 拡張機能の応答待ちを測定区間に
      // 含めると、first-render-ms が指すボトルネックが分からなくなる。
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

  const [content, setContent] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [postError, setPostError] = createSignal<string>();
  const [publishResult, setPublishResult] = createSignal<PublishResult>();

  /**
   * **順序が重要**: 署名 → 挿入 → publish。署名拒否時は catch に落ちて
   * 挿入も publish もされないので、巻き戻す状態自体が生まれない。
   */
  const postNote = async () => {
    const text = content().trim();
    const pk = pubkey();
    if (!text || !pk || posting()) return;

    setPosting(true);
    setPostError(undefined);
    setPublishResult(undefined);
    // duplicate でも本文はクリアするので、楽観一覧への追加有無とは別に持つ。
    let clearedOptimistically = false;
    try {
      // 楽観挿入は ProjectedWriter に一本化し、ここはフォームの消去とエラー表示だけ。
      const result = await projectedWriter.publish(
        { kind: 1, tags: [], content: text },
        {
          onOptimisticInsert: () => {
            // 楽観挿入と同時にクリアする —— publish 解決を待つと、挿入済み
            // ノートが表示されているのに入力欄だけ最大 PUBLISH_TIMEOUT_MS
            // 古い文面を残す。失敗時は catch で元の文面に戻す。
            setContent("");
            clearedOptimistically = true;
          },
        },
      );
      setPublishResult(result);
    } catch (error) {
      if (error instanceof WriteFailedError) {
        // 本文は残す (打ち直させないため) —— 先にクリアしていたらここで書き戻す。
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
                connections 等は行動できない診断値なので開発者モードでだけ
                出す。計算 (syncConnectionSignals) 自体は常に続き、隠れるのは表示だけ。
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
                    warmUpMs 全体の内訳。相②(全フォロイーの kind:10002) だけ
                    フォロー数に比例するので、どちらが支配的か分かる。
                  */}
                  <p
                    data-testid="warm-up-phases"
                    class="text-alpha-600 text-xs"
                  >
                    phase1: {formatWarmUpPhaseMs(warmUp()?.phase1Ms)} / phase2:{" "}
                    {formatWarmUpPhaseMs(warmUp()?.phase2Ms)}
                  </p>
                  {/* 所要時間は最も遅い 1 本で決まるので、遅い順に並べて原因を追えるようにする。 */}
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
              レンダラと EventView が共有する依存の束。store/manager と同じ
              「アプリ全体で 1 つ」なので、3 カラムまとめて 1 provider に置く。
            */}
            <EventActionsProvider value={eventActions}>
              <RenderProvider
                value={{
                  store,
                  events: eventRequests,
                  profiles: profileRequests,
                  engagements: engagementRequests,
                  // getter で渡す —— オブジェクトリテラルの値は 1 度しか評価
                  // されず、`pubkey()` だと後のログインに追随しない。
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
            // アカウントを key に Provider ごと作り直す —— 復号済み非公開項目をログアウト後/次アカウントへ持ち越さない。
            const muteList = createMuteList({
              pubkey: () => account,
              routingSettled: () =>
                warmUp.state === "ready" || warmUp.state === "errored",
              signer: activeSigner,
              store,
              writer,
              fetchLatest: fetchLatestEvent,
            });
            const followState = createFollowState({
              viewer: account,
              store,
              writer,
            });
            return FollowStateProvider({
              value: followState,
              get children() {
                return MuteListProvider({
                  value: muteList,
                  get children() {
                    return ColumnNavigationProvider({
                      value: columnNavigation,
                      get children() {
                        return renderView();
                      },
                    });
                  },
                });
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
