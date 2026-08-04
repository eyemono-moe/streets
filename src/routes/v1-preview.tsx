import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import type { Component } from "solid-js";
import {
  type ColumnDef,
  DECK_STORAGE_KEY,
  type Deck,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "../core/deck/deck";
import { warmUpRouting } from "../core/read/bootstrap";
import { EventStore } from "../core/read/event-store";
import {
  type ProfileRequests,
  createProfileRequests,
} from "../core/read/profile-requests";
import { RoutingTable } from "../core/read/routing-table";
import type { NostrSource } from "../core/read/source";
import { SubscriptionManager } from "../core/read/subscription-manager";
import { connectRelay } from "../core/relay/websocket-relay-connection";
import { createNip07Signer } from "../core/signer/nip07-signer";
import { SignerUnavailableError } from "../core/signer/signer";
import { createSection } from "../core/solid/create-section";
import Button from "../shared/components/UI/Button";
import Note from "./v1-preview/Note";
import { parseRelays } from "./v1-preview/parse-relays";

/**
 * `?relays=` でローカルリレーへ上書きする (parse-relays.ts 参照)。
 * **既定は本物のリレー。** このクエリパラメータは e2e 専用の抜け道であり、
 * 通常このアプリがリレーをクエリ文字列から取ることはない —
 * debug ルートの `?budget=` と同じ立て付け。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * デッキの 1 本のカラム。`createSection` を own する単位を `<For>` の
 * コールバックではなくコンポーネントとして切り出しているのは、カラムの
 * 追加・削除 (将来) で `createEffect`/`onCleanup` の対応関係を素直に
 * Solid の所有者ツリーへ委ねるため。
 *
 * `?relays=` (RELAYS_OVERRIDE) が効いている間は、明示リレーを持つカラム
 * (`defaultDeck` の "global" 列など) の `relays` もローカルリレーへ
 * 差し替える。これをしないと `defaultDeck` が焼き込んだ本物のリレー
 * (`FALLBACK_RELAYS`) へ e2e が外部ネットワーク越しに繋ぎに行ってしまい、
 * ローカルシードでは検証できなくなる — `fallbackRelays`/`indexers` に
 * 対する上と同じ上書きの立て付け。
 */
const DeckColumn: Component<{
  column: ColumnDef;
  store: EventStore;
  manager: SubscriptionManager;
  profileRequests: ProfileRequests;
}> = (props) => {
  const source = createMemo<NostrSource>(() => {
    const original = props.column.source;
    return RELAYS_OVERRIDE && original.relays
      ? { ...original, relays: RELAYS_OVERRIDE }
      : original;
  });

  const section = createSection({
    source,
    store: props.store,
    manager: props.manager,
  });

  return (
    <section
      data-testid="deck-column"
      data-column-id={props.column.id}
      class="h-full w-100 shrink-0 space-y-2 overflow-y-auto border-alpha-300 border-r p-3 last:border-r-0"
    >
      <h2 class="font-bold" data-testid="deck-column-title">
        {props.column.title}
      </h2>
      <p class="text-alpha-600 text-xs" data-testid="deck-column-phase">
        phase: {section.status().phase}
      </p>
      <ul data-testid="items" class="space-y-2">
        <For each={section.items()}>
          {(event) => (
            <li data-testid="item">
              <Note
                event={event}
                store={props.store}
                profileRequests={props.profileRequests}
              />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
};

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
const V1Preview: Component = () => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [deck, setDeck] = createSignal<Deck>();

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
  // あればそのまま使う —— followees の再計算を待たない。これがリロード
  // のたびに同じ 3 本が出る理由そのもの (待ってしまうと、2 回目以降の
  // 読み込みでも一瞬 defaultDeck の中身が見え、フォローが増減していれば
  // 保存済みのカラムと違うものが一瞬出てからすり替わる)。
  //
  // 保存が無い、または `loadDeck` が壊れていると判定した場合だけ、
  // フォロー数が確定するまで (warmUp.loading が終わるまで) 待って
  // `defaultDeck` を組み、保存する —— 空著者のホーム列を確定させたくない。
  // 待っている間も画面は「ログイン済み・カラム未確定」の状態を素直に
  // 描画するだけで、白画面にはならない。
  let deckInitialized = false;
  createEffect(() => {
    const pk = pubkey();
    if (!pk || deckInitialized) return;

    const stored = loadDeck(window.localStorage.getItem(DECK_STORAGE_KEY));
    if (stored) {
      deckInitialized = true;
      setDeck(stored);
      return;
    }

    if (warmUp.loading) return;
    deckInitialized = true;
    const fresh = defaultDeck(pk, warmUp()?.followees ?? []);
    window.localStorage.setItem(DECK_STORAGE_KEY, saveDeck(fresh));
    setDeck(fresh);
  });

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
  const syncConnectionSignals = () => {
    setConnections(manager.connectionCount);
    setPeakConnections(manager.peakConnectionCount);
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
      setPubkey(await signer.getPublicKey());
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

  return (
    <div class="flex h-100dvh w-screen flex-col overflow-hidden">
      <header class="shrink-0 space-y-2 border-alpha-300 border-b p-3">
        <h1 class="font-bold text-lg">v1 プレビュー</h1>

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
              <p data-testid="connections" class="text-alpha-600 text-xs">
                connections: {connections()}
              </p>
              <p data-testid="peak-connections" class="text-alpha-600 text-xs">
                peakConnections: {peakConnections()}
              </p>
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
        <div
          data-testid="deck"
          class="flex min-h-0 flex-1 divide-x overflow-x-auto"
        >
          <For each={deck()?.columns ?? []}>
            {(column) => (
              <DeckColumn
                column={column}
                store={store}
                manager={manager}
                profileRequests={profileRequests}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default V1Preview;
