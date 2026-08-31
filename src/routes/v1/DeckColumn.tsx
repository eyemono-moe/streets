import { Show, createEffect, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { columnAlerts } from "../../core/deck/column-alerts";
import type { ColumnDef } from "../../core/deck/deck";
import { excludeOwnActions } from "../../core/deck/notification-filter";
import { resolveSource } from "../../core/deck/resolve-source";
import type { NostrEvent } from "../../core/nostr/event";
import type { NostrSource } from "../../core/read/source";
import type { SubscriptionManager } from "../../core/read/subscription-manager";
import type { RelayListState } from "../../core/settings/relay-list-state";
import { createSection } from "../../core/solid/create-section";
import { createThreadSource } from "../../core/solid/create-thread-source";
import { useRender } from "../../core/view/render-context";
import ColumnAlertBadge from "./ColumnAlertBadge";
import ColumnItems from "./ColumnItems";
import DiagnosticsPanel from "./DiagnosticsPanel";
import ProfileList from "./ProfileList";
import ThreadView from "./ThreadView";
import UserProfilePanel from "./UserProfilePanel";
import { useDeviceSettings } from "./device-settings";
import { useFollowState } from "./follow-state";
import { useOptionalMuteList } from "./mute-list";
import { parseRelays } from "./parse-relays";
import { mergeProjectedEvents } from "./projected-writer";
import { ThreadNavProvider } from "./thread-nav";

/**
 * `?relays=` でローカルリレーへ上書きする。`v1.tsx` にも同じ計算があるが、
 * 同じ入力から独立に導く純粋な変換なので、モジュールをまたいで共有しない。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * デッキの 1 本のカラム。`?relays=` は明示リレーを持つカラムにも及ぶが、
 * 通知カラムだけは NIP-65 の read リレー選択自体が検証対象なので上書きしない。
 */
const DeckColumn: Component<{
  column: ColumnDef;
  manager: SubscriptionManager;
  /**
   * 現在の閲覧者。`source` が `kind: "notifications"` のとき
   * `resolveSource` がこれを `#p` へ展開する。
   */
  viewer: string;
  /** 閲覧者の NIP-65 リレーリスト。通知カラムの購読先と警告を同じ状態から導く。 */
  relayList: () => RelayListState;
  /**
   * 投稿フォームが署名直後に楽観挿入した、未エコーの自分の投稿。
   * `SectionReader` は購読経由でしか items を更新しないので重ね合わせる。
   */
  optimisticEvents: () => readonly NostrEvent[];
  /**
   * このカラムの `items()` が空でなくなるたびに呼ぶ。「初回だけ記録する」
   * 判定は 3 カラムぶんまとめる呼び出し側に委ねる。
   */
  onHasItems: () => void;
  /** このカラムに最初のイベントが出るまでの ms。未着なら undefined。 */
  firstRenderMs: () => number | undefined;
  /** 先頭カラムなら false。「←」を非表示にはせず disabled にする —— 押せる
   * ボタンの数が並べ替えのたびに変わらないほうが、連打での位置把握が楽。 */
  canMoveLeft: () => boolean;
  /** 末尾カラムなら false。canMoveLeft と同じ理由。 */
  canMoveRight: () => boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
}> = (props) => {
  const settings = useDeviceSettings();
  const muteList = useOptionalMuteList();
  const followState = useFollowState();
  const userPubkey = () =>
    props.column.source.kind === "user"
      ? props.column.source.pubkey
      : undefined;
  const profileListKind = () =>
    props.column.source.kind === "followees-list" ||
    props.column.source.kind === "followers-list"
      ? props.column.source.kind
      : undefined;
  const source = createMemo<NostrSource>(() => {
    // `followees: followState.followees` は呼ばずに渡す —— ここで呼ぶと
    // `literal` 列の memo も warmUp の結果に依存したことになり、warmUp が
    // settle するたびに全カラムが再購読される。`relayList` も同様。
    const resolved = resolveSource(props.column.source, {
      followees: followState.followees,
      viewer: props.viewer,
      relayList: props.relayList,
    });
    // `?relays=` の上書きは解決した**後**に当てる —— 上書きは
    // `NostrSource.relays` を見るので、逆順だと明示リレーのカラムが
    // 差し替わらない。通知は read リレー切り替えの検証対象なので除外。
    return RELAYS_OVERRIDE &&
      resolved.relays &&
      props.column.source.kind !== "notifications"
      ? { ...resolved, relays: RELAYS_OVERRIDE }
      : resolved;
  });

  const section = createSection({
    source,
    manager: props.manager,
  });

  const store = useRender().store;

  /** 空 = 根のカラム。push でスレッドへ進み、pop で戻る。 */
  const [stack, setStack] = createSignal<string[]>([]);
  const focusId = () => stack().at(-1);
  // いま見ている焦点そのものを押しても push しない —— `ThreadView` は
  // 焦点のノートも同じクリックハンドラを通すので、素通しにすると
  // 「変化しない重複フレーム」が積まれ、戻るボタンを 1 回押しても
  // 表示が変わらないように見える (実際には重複フレームを 1 枚捨てただけ)。
  const openThread = (id: string) =>
    setStack((s) => (s.at(-1) === id ? s : [...s, id]));
  const closeThread = () => setStack((s) => s.slice(0, -1));

  /**
   * スレッドの購読は**根**に投げる —— NIP-10 を守る返信は深さに関わらず
   * 全員が根を `e` タグで指すので、これ 1 本で祖先も返信も届く。
   */
  const threadSource = createThreadSource({
    focusId,
    store,
    // 通知カラムの relays は「自分宛が配送される場所 (inbox)」であって
    // 「スレッドの祖先が置いてある場所」ではない。渡すと
    // `create-thread-source` がそれを唯一の購読先として narrow し、
    // 自分宛でない祖先 (自分の元ノートを含む) が永久に取れなくなる。
    columnRelays: () =>
      props.column.source.kind === "notifications"
        ? undefined
        : source().relays,
    relaysOverride: RELAYS_OVERRIDE,
  });

  const threadSection = createSection({
    source: threadSource.source,
    manager: props.manager,
  });

  // いま画面に出ているセクションを映す。根のカラムでは `section`、
  // スレッドを開いている間は `threadSection` —— 固定で `section` のままだと、
  // 診断パネル (下記) だけでなく `ColumnAlertBadge` もスレッドを開いている
  // 間はユーザーに見えていない根のカラムの状態を報告し続けることになる。
  const activeSection = createMemo(() => (focusId() ? threadSection : section));

  // 行動できる異常だけを取り出す (判定は columnAlerts に集約)。渡すのは
  // **いま見えているセクション** (`activeSection`) の状態 —— 固定で
  // `section` のままだと、スレッド側の到達不能が developer mode でしか気付けない。
  const alerts = createMemo(() =>
    columnAlerts(
      props.column,
      activeSection().status(),
      // 「設定が無い」のか「まだ届いていない」のかの判定は
      // `columnAlerts` 側へ集約済み —— ここでは状態を渡すだけ。
      props.relayList(),
    ),
  );

  /**
   * 楽観挿入とセクション本体の items をマージする。フィルタに合わない
   * ものと、`section.items()` に既にある id (リレーエコー到着済み) は除く。
   */
  const items = createMemo(() => {
    const merged = mergeProjectedEvents(
      section.items(),
      props.optimisticEvents(),
      source().filters,
    );
    // 通知列でだけ自分の行動を落とす。**捨てるのはセクションが
    // 保持した後**なので、保持上限 200 件は捨てる前の件数で数えている ——
    // 自分の行動が多いと見える件数がそのぶん減る。
    const visible =
      props.column.source.kind === "notifications"
        ? excludeOwnActions(merged, props.viewer)
        : merged;
    // kind:10000 の取得前・取得失敗を「空のミュートリスト」と扱うと、
    // キャッシュ済み本文が一度露出してから消える。確定するまでは本文を
    // 仮想リストへ渡さず、設定画面の再試行導線だけを見せる。
    const mutePhase = muteList?.state().phase;
    if (
      mutePhase !== undefined &&
      mutePhase !== "missing" &&
      mutePhase !== "ready"
    ) {
      return [];
    }
    // Store と SectionReader には残し、仮想リストへ渡す直前でだけ除く。
    // 解除後は再購読なしで同じイベントを再表示できる。
    return muteList
      ? visible.filter((event) => muteList.matches(event).length === 0)
      : visible;
  });

  /**
   * 返信を署名直後に開いているスレッドへ重ねる。根カラムと同じ id
   * 重複排除を行い、別スレッドの返信や新規投稿は filters で混ぜない。
   */
  const threadItems = createMemo(() =>
    mergeProjectedEvents(
      threadSection.items(),
      props.optimisticEvents(),
      threadSource.source().filters,
    ),
  );

  // `items()` が空でなくなるたびに親へ知らせる。
  // 「初回だけ」の判定は親側 (`props.onHasItems` の実体、
  // `createFirstRenderRecorder`) の役目 —— ここでは呼ぶだけでよい。
  createEffect(() => {
    if (items().length > 0) props.onHasItems();
  });

  // タイトルのインライン編集。編集中だけ input に切り替える —— 常に input
  // を出すと、クリックしていない他のカラムのタイトルまで編集可能に見えて
  // しまう (見た目上どれが編集対象か分からなくなる)。
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [titleDraft, setTitleDraft] = createSignal(props.column.title);

  const startEditingTitle = () => {
    setTitleDraft(props.column.title);
    setEditingTitle(true);
  };

  // 保存するかどうかの判定 (空文字を弾くかどうか) は `renameColumn`
  // (v1.tsx) 側の責務。ここでは常に `onRename` を呼ぶだけにする —— 空文字を
  // ここでも弾くと「空を拒否する」というルールが 2 箇所に分かれ、片方だけ
  // 直して片方を直し忘れる余地ができる。
  const commitTitle = () => {
    props.onRename(titleDraft());
    setEditingTitle(false);
  };

  return (
    <section
      data-testid="deck-column"
      data-column-id={props.column.id}
      // 幅 380。ヘッダーはカラムと一緒にスクロールさせず、
      // 上端に貼り付ける —— 長いタイムラインの途中でカラムを取り違えない
      // ようにするため、名前と操作は常に見えている必要がある。
      class="flex h-full w-95 shrink-0 flex-col overflow-hidden border-r last:border-r-0"
    >
      {/*
        カラムの識別色。ヘッダーの文字とは別の層で効く —— スクロール中に
        カラムを区別するとき、人は先に色を見る。現状は全カラム共通の色。
      */}
      <div
        data-testid="column-accent"
        class="h-0.75 shrink-0 bg-accent-primary"
      />
      <header class="flex h-12 shrink-0 items-center gap-1 px-2">
        <Show
          when={focusId()}
          fallback={
            <button
              type="button"
              data-testid="column-move-left"
              aria-label="カラムを左へ"
              class="flex h-8 w-8 shrink-0 appearance-none items-center justify-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover disabled:opacity-30"
              disabled={!props.canMoveLeft()}
              onClick={props.onMoveLeft}
            >
              <span class="i-material-symbols:chevron-left-rounded c-secondary h-5 w-5" />
            </button>
          }
        >
          {/* スレッドを開いている間は「カラムを左へ」を戻るボタンに差し替える —— 左端の位置を保ったままスタックを 1 段 pop する。 */}
          <button
            type="button"
            data-testid="thread-back"
            aria-label="戻る"
            class="flex h-8 w-8 shrink-0 appearance-none items-center justify-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover"
            onClick={closeThread}
          >
            <span class="i-material-symbols:chevron-left-rounded c-secondary h-5 w-5" />
          </button>
        </Show>

        <Show
          when={!focusId()}
          fallback={
            <h2 class="min-w-0 flex-1 truncate font-bold text-body">
              スレッド
            </h2>
          }
        >
          <Show
            when={editingTitle()}
            fallback={
              // h2 に直接 onClick を付けると非対話要素がキーボード操作を
              // 持たない (biome lint/a11y)。クリック/キー操作は中の
              // button に持たせ、Enter/Space の面倒はブラウザに任せる。
              <h2 class="min-w-0 flex-1 truncate font-bold text-body">
                <button
                  type="button"
                  data-testid="deck-column-title"
                  class="w-full cursor-text truncate text-left"
                  onClick={startEditingTitle}
                >
                  {props.column.title}
                </button>
              </h2>
            }
          >
            <input
              autofocus
              data-testid="deck-column-title"
              class="min-w-0 flex-1 rounded-2 border border-alpha-300 bg-alpha-50 px-1 font-bold"
              value={titleDraft()}
              onInput={(event) => setTitleDraft(event.currentTarget.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingTitle(false);
                }
              }}
            />
          </Show>
        </Show>

        <ColumnAlertBadge alerts={alerts} />

        <button
          type="button"
          data-testid="column-move-right"
          aria-label="カラムを右へ"
          class="flex h-8 w-8 shrink-0 appearance-none items-center justify-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover disabled:opacity-30"
          disabled={!props.canMoveRight()}
          onClick={props.onMoveRight}
        >
          <span class="i-material-symbols:chevron-right-rounded c-secondary h-5 w-5" />
        </button>
        <button
          type="button"
          data-testid="column-remove"
          aria-label="カラムを削除"
          class="flex h-8 w-8 shrink-0 appearance-none items-center justify-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-alpha-hover disabled:opacity-30"
          onClick={props.onRemove}
        >
          <span class="i-material-symbols:close-rounded c-secondary h-5 w-5" />
        </button>
      </header>
      {/*
        `status.incomplete` は行動できない診断値なので開発者モードでだけ
        出す (計算は常に続き、隠れるのは表示だけ)。行動できる異常は
        `ColumnAlertBadge` が別枠で常時出す。
      */}
      <DiagnosticsPanel visible={settings.developerMode}>
        <div class="space-y-1 px-2 pb-2">
          <p
            class="text-alpha-600 text-xs"
            data-testid="deck-column-first-render-ms"
          >
            firstRenderMs:{" "}
            {props.firstRenderMs() === undefined
              ? "-"
              : props.firstRenderMs()?.toFixed(2)}
          </p>
          <p class="text-alpha-600 text-xs" data-testid="deck-column-phase">
            phase: {activeSection().status().phase}
          </p>
          <Show when={activeSection().status().incomplete}>
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
        </div>
      </DiagnosticsPanel>
      {/*
        スクロールするのは本文だけ。**この容器が e2e の掴み先**
        (`column-scroll`) —— `deck-column` を掴むとヘッダー固定時に何もスクロールしなくなる。
      */}
      <div data-testid="column-scroll" class="min-h-0 flex-1 overflow-y-auto">
        {/*
          `open` でスタックへ push する (`Note.tsx` のクリックハンドラが
          呼ぶ)。根だけでなくスレッド内の祖先・返信からも新しい背骨に
          引き直せるよう、本文全体をこの provider の中に置く。
        */}
        <ThreadNavProvider open={openThread}>
          <Show
            when={focusId()}
            fallback={
              <>
                <Show when={userPubkey()} keyed>
                  {(pubkey) => (
                    <UserProfilePanel pubkey={pubkey} manager={props.manager} />
                  )}
                </Show>
                <Show
                  when={profileListKind()}
                  keyed
                  fallback={<ColumnItems items={items} />}
                >
                  {(kind) => (
                    <ProfileList
                      kind={kind}
                      items={items}
                      status={section.status}
                    />
                  )}
                </Show>
              </>
            }
          >
            {(id) => (
              <ThreadView
                events={threadItems}
                focusId={id()}
                status={threadSection.status}
              />
            )}
          </Show>
        </ThreadNavProvider>
      </div>
    </section>
  );
};

export default DeckColumn;
