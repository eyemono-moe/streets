import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import type { Component } from "solid-js";
import {
  type ColumnDef,
  type Deck,
  deckStorageKey,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "../core/deck/deck";
import type { NostrEvent, UnsignedEvent } from "../core/nostr/event";
import { warmUpRouting } from "../core/read/bootstrap";
import { FALLBACK_RELAYS } from "../core/read/default-relays";
import { createEventRequests } from "../core/read/event-requests";
import { EventStore } from "../core/read/event-store";
import { createProfileRequests } from "../core/read/profile-requests";
import { RoutingTable } from "../core/read/routing-table";
import { SubscriptionManager } from "../core/read/subscription-manager";
import { connectRelay } from "../core/relay/websocket-relay-connection";
import {
  DEVELOPER_MODE_STORAGE_KEY,
  loadDeveloperMode,
  saveDeveloperMode,
} from "../core/settings/developer-mode";
import { createNip07Signer } from "../core/signer/nip07-signer";
import { SignerUnavailableError } from "../core/signer/signer";
import { RenderProvider } from "../core/view/render-context";
import { type PublishResult, createPublisher } from "../core/write/publisher";
import Button from "../shared/components/UI/Button";
import AddColumnForm from "./v1/AddColumnForm";
import DeckColumn from "./v1/DeckColumn";
import DiagnosticsPanel from "./v1/DiagnosticsPanel";
import {
  addColumnTo,
  moveColumnIn,
  removeColumnFrom,
  renameColumnIn,
} from "./v1/deck-mutations";
import { createFirstRenderRecorder } from "./v1/first-render-recorder";
import { parseRelays } from "./v1/parse-relays";
import { defaultRenderers } from "./v1/renderers";
import { verifyOptimisticInsert } from "./v1/verify-optimistic-insert";

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
 * v1 の垂直スライス。ログイン (Task 1) → 1 カラム描画 (Task 2) に続き、
 * ここでデッキ (3 カラム) と localStorage への永続化を足す。
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
const V1: Component = () => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [deck, setDeck] = createSignal<Deck>();

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
  /**
   * `DeckColumn` (3 カラムぶん) が `items()` が空でなくなるたびに呼ぶ
   * (`DeckColumn.tsx` の `onHasItems` 参照)。「最初の 1 回だけ記録する」判定
   * そのものは `recordFirstRender` (`first-render-recorder.ts`) に委ねている
   * ので、ここでは「pubkey がまだ無ければ無視する」ガードと
   * `setFirstRenderMs` への反映だけを行う。
   */
  const onColumnHasItems = () => {
    if (loginStartMs === undefined) return;
    const elapsed = recordFirstRender(performance.now() - loginStartMs);
    if (elapsed !== undefined) setFirstRenderMs(elapsed);
  };

  // 開発者モード (ADR-0026)。端末ごと (localStorage)、既定は無効。デッキ
  // (pubkey ごとの deckStorageKey) とは別の保存先 —— どの端末で開発者と
  // して見ているかはアカウントの設定ではない (developer-mode.ts のコメント
  // 参照)。設定画面はまだ無い (フェーズ C) ので、トグルをヘッダに直置きする。
  const [developerMode, setDeveloperMode] = createSignal(
    loadDeveloperMode(window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY)),
  );
  const toggleDeveloperMode = () => {
    const next = !developerMode();
    setDeveloperMode(next);
    window.localStorage.setItem(
      DEVELOPER_MODE_STORAGE_KEY,
      saveDeveloperMode(next),
    );
  };

  // 読み取り層の配線。debug/v1-section.tsx と同じ構成
  // (EventStore → RoutingTable → SubscriptionManager → warmUpRouting →
  // createSection)。manager (= ConnectionPool) は 3 カラムぶんの
  // createSection すべてで共有する — ADR-0011 の 30 接続予算はカラム単位
  // ではなくアプリ全体の予算なので、カラムごとに別の manager を持つと
  // 予算が意味を失う。
  const store = new EventStore();
  const routing = new RoutingTable(store);
  const manager = new SubscriptionManager({
    store,
    routing,
    connect: connectRelay,
    // undefined なら SubscriptionManager 自身の既定 (FALLBACK_RELAYS) が効く
    fallbackRelays: RELAYS_OVERRIDE,
  });
  // プロフィール要求のコアレッサ (spec 4 節, Task 5)。manager と同じ理由で
  // 3 カラムぶん共有する —— 別々に持つと、同じ著者が複数カラムに出るたびに
  // 別々のコアレッサがそれぞれ REQ を投げてしまい、まとめた意味が薄れる。
  const profileRequests = createProfileRequests({ store, manager });
  onCleanup(() => profileRequests.dispose());
  // 関連イベント (返信元・引用先・リポスト対象) 要求のコアレッサ
  // (design 4.2 節)。profileRequests と同じ理由で 3 カラムぶん共有する ——
  // レンダラは EventView を通じてこの 1 つだけを見る (RenderProvider 経由)。
  const eventRequests = createEventRequests({ store, manager });
  onCleanup(() => eventRequests.dispose());

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

  // pubkey が undefined の間 (ログイン前) は createResource がフェッチャーを
  // 呼ばない — デバッグルートのような「空文字を弾く」ガードが要らない
  // (source が nullish なら Solid 自身が起動を見送るため)。
  const [warmUp] = createResource(pubkey, (pk) =>
    warmUpRouting({
      pubkey: pk,
      store,
      // マネージャと同じ ConnectionPool を使う (ADR-0011 の予算を一本化する)
      pool: manager.pool,
      // undefined なら warmUpRouting 自身の既定 (BOOTSTRAP_INDEXERS) が効く
      indexers: RELAYS_OVERRIDE,
    }),
  );

  // デッキの読み込みと既定デッキの確定は一度だけ行う。
  //
  // pubkey が確定した直後に localStorage を読み、保存済みのものが
  // あればそのまま使う —— これがリロードのたびに同じ 3 本が即座に出る
  // 理由そのもの。
  //
  // 保存が無い、または `loadDeck` が壊れていると判定した場合は
  // `defaultDeck` を組んで保存する。**`warmUp.loading` を待たない** ——
  // かつては `defaultDeck` 自身が followees をフィルタへ焼き込んでいたので
  // ここで待つ必要があったが、`ColumnSource` を派生ソースにしたことで
  // (`resolve-source.ts`) `defaultDeck` はもう followees を受け取らない。
  // `home` 列は `{ kind: "followees", kinds: [1] }` という意図だけを保存し、
  // `DeckColumn` 側の `resolveSource` が描画のたびに最新の
  // `warmUp()?.followees` を展開する。つまり `defaultDeck` を組む時点で
  // followees が未確定でも実害が無い (焼き込む値が無いので古い値で固定
  // される心配がそもそも無い) —— 待つ理由が消えたので待たない。
  let deckInitialized = false;
  createEffect(() => {
    const pk = pubkey();
    if (!pk || deckInitialized) return;

    // pubkey ごとにキーを分ける (final review, Important 3) —— でないと
    // 別アカウントでログインし直したときに前のアカウントのデッキ
    // (followees や著者フィルタを含む) をそのまま引き継いでしまう。
    const storageKey = deckStorageKey(pk);
    const stored = loadDeck(window.localStorage.getItem(storageKey));
    if (stored) {
      deckInitialized = true;
      setDeck(stored);
      return;
    }

    deckInitialized = true;
    const fresh = defaultDeck(pk);
    // **順序が重要 (最終レビュー Minor 5)**: `setDeck` を先に、
    // `localStorage.setItem` を後に。`setItem` はストレージが無効・
    // Safari プライベートモードなどで例外を投げうる。逆順 (今までの順序)
    // だと、その例外でこの `createEffect` が中断し `setDeck` まで到達
    // しないため `deck()` が永久に `undefined` のまま —— 空デッキの表示に
    // 固定され、`addColumn` も `!deck()` で早期リターンするので「+」を
    // 押しても何も起きない、詰んだセッションになる。先に `setDeck` して
    // おけば、`setItem` が後で失敗しても「保存はされないが今のセッションは
    // 使える」という縮退で済む。
    setDeck(fresh);
    window.localStorage.setItem(storageKey, saveDeck(fresh));
  });

  // デッキの変更は必ずこの 1 関数を通す —— 保存を忘れた経路が 1 つでも
  // あると、その操作だけリロードで消える (ユーザーには「たまに保存され
  // ない」としか見えない、いちばん報告しにくい壊れ方になる)。
  //
  // ここも `setDeck` → `setItem` の順序 (最終レビュー Minor 5、上の初期化
  // 効果と同じ理由) —— こちらは元から正しい順序だった。`setItem` が例外を
  // 投げても、画面はすでに新しいデッキを見ているので操作そのものは反映
  // される (次回リロードで戻るだけで、その場では詰まない)。
  const updateDeck = (next: Deck) => {
    const pk = pubkey();
    if (!pk) return;
    setDeck(next);
    window.localStorage.setItem(deckStorageKey(pk), saveDeck(next));
  };

  // 4 つの操作本体 (`Deck → Deck`) は ./v1/deck-mutations.ts の純関数に
  // 委ねている。ここでの役目は「現在のデッキを読む」→「純関数を適用する」
  // →「変化していれば updateDeck へ渡す」の 3 段だけ。変化の有無を参照
  // 比較で見ているのは、`moveColumnIn`/`renameColumnIn` が変化なしのとき
  // 入力の `deck` をそのまま (同一参照で) 返す契約になっているため ——
  // これにより端での移動や空タイトルでの改名が無駄な localStorage 書き込み
  // を起こさない。
  const addColumn = (column: ColumnDef) => {
    const current = deck();
    if (!current) return;
    updateDeck(addColumnTo(current, column));
  };

  const removeColumn = (id: string) => {
    const current = deck();
    if (!current) return;
    updateDeck(removeColumnFrom(current, id));
  };

  const moveColumn = (id: string, direction: -1 | 1) => {
    const current = deck();
    if (!current) return;
    const next = moveColumnIn(current, id, direction);
    if (next === current) return;
    updateDeck(next);
  };

  const renameColumn = (id: string, title: string) => {
    const current = deck();
    if (!current) return;
    const next = renameColumnIn(current, id, title);
    if (next === current) return;
    updateDeck(next);
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
  const [batchSizes, setBatchSizes] = createSignal({
    events: { last: 0, max: 0 },
    profiles: { last: 0, max: 0 },
  });
  const syncConnectionSignals = () => {
    setBatchSizes({
      events: {
        last: eventRequests.lastBatchSize,
        max: eventRequests.maxBatchSize,
      },
      profiles: {
        last: profileRequests.lastBatchSize,
        max: profileRequests.maxBatchSize,
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
      setPubkey(pk);
    } catch (error) {
      setErrorMessage(
        error instanceof SignerUnavailableError
          ? // TODO: NIP-46 (bunker) の導線 (ADR-0008 の Consequences) は後続タスク
            "拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等) を導入してから、もう一度ログインボタンを押してください。"
          : `ログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  // 投稿フォーム。
  const [content, setContent] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [postError, setPostError] = createSignal<string>();
  const [publishResult, setPublishResult] = createSignal<PublishResult>();
  // 署名直後に楽観挿入した自分の投稿 (まだリレーから戻ってきていないもの
  // も含む) —— DeckColumn がここから自分のフィルタに合う分だけ拾って表示
  // に重ねる。EventStore へ入れるだけでは画面に反映されない
  // (`SectionReader` は購読経由の配信でしか items を更新しない) ため、
  // 表示専用にこのリストを別に持つ。
  const [optimisticEvents, setOptimisticEvents] = createSignal<NostrEvent[]>(
    [],
  );
  /**
   * 直近の投稿で、`store.put()` から `setOptimisticEvents()` の signal 書き
   * 込みが完了するまでにかかった ms (fix round 1: 仕様 10 節 問い 3 の材料)。
   * `signer.signEvent()` の待ち時間は含まない —— 意図的に楽観挿入の経路
   * だけを見る。`connections`/`peakConnections` と同じ診断用の常設表示
   * (計測が終わったら消す、ということはしない — 実鍵での検証を行う人間も
   * この数値を見たいはずで、消えてしまうと再確認できない)。
   */
  const [optimisticInsertMs, setOptimisticInsertMs] = createSignal<number>();

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
    try {
      const signer = createNip07Signer();
      const unsigned: UnsignedEvent = {
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: text,
      };
      const signed = await signer.signEvent(unsigned);

      // 楽観的更新: リレーの応答を待たず、署名が終わった時点で即座に
      // 自分のカラムへ映す (受け入れ確認 1)。"local" は実在するリレーの
      // URL ではない —— 自分の手元での挿入だと分かる印。
      //
      // ここだけを performance.now() で挟んで計測する (仕様 10 節 問い 3、
      // fix round 1)。`signer.signEvent()` を含めた「クリックしてから見える
      // まで」を e2e ハーネス越しに計測すると、署名側 (このスライスの検証
      // では page.exposeFunction 越しの Node 呼び出しという、実運用には無い
      // IPC ホップ) のジッタが乗り、ADR-0011 の 100ms 予算をこの経路単体で
      // 満たしているかどうかを何も語れなくなる (fix round 1 の指摘)。
      // store.put() から setOptimisticEvents() が同期的に (Solid の signal
      // 書き込みはこの await の後、DOM 委譲の自動 batch の外で実行される
      // ため、依存する DeckColumn の items memo と <For> の DOM パッチまで
      // 含めて同期的に) 完了するまでを測ることで、signEvent を完全に除外し、
      // 楽観挿入の経路そのものが何 ms かを見る。
      const optimisticStart = performance.now();
      // store.put() の戻り値を捨てない (final review, Important 5) ——
      // 詳細は verify-optimistic-insert.ts のコメント参照。
      verifyOptimisticInsert(store.put(signed, "local"));
      setOptimisticEvents((prev) => [signed, ...prev]);
      setOptimisticInsertMs(performance.now() - optimisticStart);
      setContent("");

      const result = await publisher.publish(signed);
      setPublishResult(result);
    } catch (error) {
      setPostError(
        error instanceof SignerUnavailableError
          ? "拡張機能が見つかりません。"
          : `投稿に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <div class="flex h-100dvh w-screen flex-col overflow-hidden">
      <header class="shrink-0 space-y-2 border-alpha-300 border-b p-3">
        <div class="flex items-center justify-between gap-2">
          <h1 class="font-bold text-lg">v1 プレビュー</h1>
          {/*
            開発者モードのトグル (ADR-0026)。設定画面は作らない (Consequences
            が定めるフェーズ C) —— 端末ごとの localStorage を直接読み書き
            するだけの、ヘッダ直置きのトグル。
          */}
          <Button
            data-testid="developer-mode-toggle"
            variant="border"
            onClick={toggleDeveloperMode}
          >
            開発者モード: {developerMode() ? "ON" : "OFF"}
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
                    {optimisticInsertMs() === undefined
                      ? "-"
                      : optimisticInsertMs()?.toFixed(2)}
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
                  <p data-testid="event-batch" class="text-alpha-600 text-xs">
                    eventBatch: {batchSizes().events.last} (max{" "}
                    {batchSizes().events.max})
                  </p>
                  <p data-testid="profile-batch" class="text-alpha-600 text-xs">
                    profileBatch: {batchSizes().profiles.last} (max{" "}
                    {batchSizes().profiles.max})
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
          <Button data-testid="login" disabled={loading()} onClick={login}>
            {loading() ? "確認中…" : "NIP-07 でログイン"}
          </Button>

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
      </header>

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
          when={(deck()?.columns.length ?? 0) > 0}
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
            <RenderProvider
              value={{
                store,
                events: eventRequests,
                profiles: profileRequests,
                renderers: defaultRenderers,
              }}
            >
              <For each={deck()?.columns ?? []}>
                {(column, index) => (
                  <DeckColumn
                    column={column}
                    store={store}
                    manager={manager}
                    followees={() => warmUp()?.followees ?? []}
                    optimisticEvents={optimisticEvents}
                    onHasItems={onColumnHasItems}
                    developerMode={developerMode}
                    canMoveLeft={() => index() > 0}
                    canMoveRight={() =>
                      index() < (deck()?.columns.length ?? 0) - 1
                    }
                    onMoveLeft={() => moveColumn(column.id, -1)}
                    onMoveRight={() => moveColumn(column.id, 1)}
                    onRemove={() => removeColumn(column.id)}
                    onRename={(title) => renameColumn(column.id, title)}
                  />
                )}
              </For>
            </RenderProvider>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default V1;
