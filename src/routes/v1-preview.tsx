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
  type Deck,
  deckStorageKey,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "../core/deck/deck";
import type { NostrEvent, UnsignedEvent } from "../core/nostr/event";
import { warmUpRouting } from "../core/read/bootstrap";
import { FALLBACK_RELAYS } from "../core/read/default-relays";
import { EventStore } from "../core/read/event-store";
import { matchesAnyFilter } from "../core/read/filter-match";
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
import { type PublishResult, createPublisher } from "../core/write/publisher";
import Button from "../shared/components/UI/Button";
import Note from "./v1-preview/Note";
import { parseRelays } from "./v1-preview/parse-relays";
import { verifyOptimisticInsert } from "./v1-preview/verify-optimistic-insert";

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
  /**
   * 投稿フォームが署名直後に楽観挿入した、まだリレーから戻って
   * きていない自分の投稿。`SectionReader` は購読経由でしか items を更新
   * できない (`store.put()` を直接呼んでも拾わない) ので、表示側でこの
   * リストを重ね合わせる。
   */
  optimisticEvents: () => NostrEvent[];
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

  /**
   * 楽観挿入とセクション本体の items をマージする (仕様 6 節、受け入れ確認
   * 1, 2)。
   *
   * - このカラムのフィルタに合わないもの (他人の投稿を映すカラムに自分の
   *   投稿を混ぜない) は素通しで除く —— `matchesAnyFilter` はローカル
   *   フィルタ照合そのもの (ADR-0023) で、リレーへ実際に送っている REQ と
   *   同じ判定を使う。
   * - `section.items()` に同じ id が既に載っているものは除く —— リレーが
   *   自分の投稿をエコーして本物の経路に乗った後は、そちらを正として二重
   *   表示しない (self-follow で自分の投稿が戻ってくるのは普通に起こる)。
   */
  const items = createMemo(() => {
    const fromSection = section.items();
    const knownIds = new Set(fromSection.map((event) => event.id));
    const optimistic = props
      .optimisticEvents()
      .filter(
        (event) =>
          !knownIds.has(event.id) && matchesAnyFilter(event, source().filters),
      );
    return [...optimistic, ...fromSection];
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
      {/*
        仕様 7 節が要求する「`status.incomplete` の生の数値をそのまま見せる」。
        ADR-0011 は欠落を黙って隠すことを禁じており、ユーザー向けの翻訳層は
        繰延にしたので、ここでは診断値のまま出す。

        Task 2 の単一カラムでは出していたが、Task 3 で `DeckColumn` へ書き直した
        際に落ちていた (2026-08-05 に人手で発見)。3 つのレビューが見落としたのは、
        この要求が spec の別の節 (エラー処理表) にあり、Task 3 の受け入れ確認が
        カラム数・リロード・localStorage に向いていたためである。
      */}
      <Show when={section.status().incomplete}>
        {(incomplete) => (
          <p
            class="text-alpha-600 text-xs"
            data-testid="deck-column-incomplete"
          >
            unreachableRelays: {incomplete().unreachableRelays} /
            unroutableAuthors: {incomplete().unroutableAuthors} /
            uncoveredAuthors: {incomplete().uncoveredAuthors}
          </p>
        )}
      </Show>
      <ul data-testid="items" class="space-y-2">
        <For each={items()}>
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

    if (warmUp.loading) return;
    deckInitialized = true;
    const fresh = defaultDeck(pk, warmUp()?.followees ?? []);
    window.localStorage.setItem(storageKey, saveDeck(fresh));
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
              <p
                data-testid="optimistic-insert-ms"
                class="text-alpha-600 text-xs"
              >
                optimisticInsertMs:{" "}
                {optimisticInsertMs() === undefined
                  ? "-"
                  : optimisticInsertMs()?.toFixed(2)}
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
                optimisticEvents={optimisticEvents}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default V1Preview;
