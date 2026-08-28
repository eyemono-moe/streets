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
import ThreadView from "./ThreadView";
import { useDeviceSettings } from "./device-settings";
import { useOptionalMuteList } from "./mute-list";
import { parseRelays } from "./parse-relays";
import { mergeProjectedEvents } from "./projected-writer";
import { ThreadNavProvider } from "./thread-nav";

/**
 * `?relays=` でローカルリレーへ上書きする (parse-relays.ts 参照)。
 * `v1.tsx` にも同じ計算があるが、両者は同じ入力 (URL のクエリ文字列) から
 * 導く純粋な変換であり、モジュールをまたいで値を共有する必要がない ——
 * 1 箇所を import し合うより、それぞれのモジュールで独立に計算したほうが
 * 「どこで何が決まるか」が閉じて読みやすい。
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
 * `?relays=` (RELAYS_OVERRIDE) が効いている間は、明示リレーを持つ通常の
 * カラム (`defaultDeck` の "global" 列など) の `relays` もローカルリレーへ
 * 差し替える。これをしないと `defaultDeck` が焼き込んだ本物のリレー
 * (`FALLBACK_RELAYS`) へ e2e が外部ネットワーク越しに繋ぎに行ってしまい、
 * ローカルシードでは検証できなくなる — `fallbackRelays`/`indexers` に
 * 対する上と同じ上書きの立て付け。ただし通知カラムは NIP-65 の read
 * リレー選択そのものが検証対象なので上書きしない。
 */
const DeckColumn: Component<{
  column: ColumnDef;
  manager: SubscriptionManager;
  /**
   * 現在の閲覧者のフォローリスト (kind:1 の pubkey 集合)。`source` が
   * `kind: "followees"` のとき `resolveSource` がこれを著者フィルタへ
   * 展開する。デッキ自体はこの値を焼き込まない (`resolve-source.ts` 参照)
   * ので、フォローが増減しても呼び出し元がこの関数を最新の値で呼び直す
   * だけで反映される。
   */
  followees: () => readonly string[];
  /**
   * 現在の閲覧者。`source` が `kind: "notifications"` のとき
   * `resolveSource` がこれを `#p` へ展開する。
   */
  viewer: string;
  /** 閲覧者の NIP-65 リレーリスト。通知カラムの購読先と警告を同じ状態から導く。 */
  relayList: () => RelayListState;
  /**
   * 投稿フォームが署名直後に楽観挿入した、まだリレーから戻って
   * きていない自分の投稿。`SectionReader` は購読経由でしか items を更新
   * できない (`store.put()` を直接呼んでも拾わない) ので、表示側でこの
   * リストを重ね合わせる。
   */
  optimisticEvents: () => readonly NostrEvent[];
  /**
   * このカラムの `items()` が空でなくなるたびに呼ぶ (task-5-brief.md
   * Step 1)。**「初回だけ記録する」判定はここではしない** —— 呼び出し側
   * (`v1.tsx`) が `createFirstRenderRecorder` で 3 カラムぶんまとめて
   * 「最初の 1 回」に絞る。ここで各カラムが自分だけの初回判定を持つと、
   * 3 カラムがそれぞれ「自分にとっての初回」を報告してしまい、結局
   * 呼び出し側で「複数の初回」を 1 つへ潰す作業が要る点は変わらない ——
   * それなら最初から「空でなくなるたび呼ぶだけ」にして、判定を 1 箇所
   * (呼び出し側) に集めたほうが読みやすい。
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
  const source = createMemo<NostrSource>(() => {
    // `followees: props.followees` (呼ばずに渡す) —— `resolveSource` が
    // `kind: "followees"` の分岐でだけこれを呼ぶ (`resolve-source.ts` の
    // コメント参照)。ここで `props.followees()` と呼んで値を渡してしまうと、
    // `literal` 列でもこの memo が warmUp の結果 (フォローリストのリソース)
    // を読んだことになり、ウォームアップが settle するたびに全カラムが
    // 再購読される。`relayList` も同じ扱い。
    const resolved = resolveSource(props.column.source, {
      followees: props.followees,
      viewer: props.viewer,
      relayList: props.relayList,
    });
    // `?relays=` の e2e 上書きは**解決した後**に当てる —— 上書きが見るのは
    // `NostrSource.relays` であって `ColumnSource` ではない。順序を逆に
    // すると、明示リレーを持つカラムがローカルリレーへ差し替わらず、
    // e2e が外部ネットワークへ繋ぎに行く。通知だけは設定された read
    // リレーへ実際に切り替わることを e2e で証明するため上書きしない。
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
   * スレッドの購読は**根**に投げる。NIP-10 を守る返信は深さに関わらず
   * 全員が根を `e` タグで指すので、これ 1 本で祖先も返信も届く。
   *
   * 組み立てそのものは `createThreadSource` (`core/solid/`) へ切り出して
   * ある —— 根の id でのメモ化、リレーヒントの反応性の切り離し (1 段進む
   * だけで購読が張り直されない)、`?relays=` の非対称な上書きは、
   * `SubscriptionManager`/`RenderProvider` を用意しなくても検証できる
   * ほうがよい性質であり、実際に `create-thread-source.test.ts` が
   * ユニットテストとして守っている。
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

  // ユーザーが行動できる異常だけを取り出す (ADR-0026)。判定そのものは
  // columnAlerts に集約済みで、ここでは呼ぶだけ。**いま見えている
  // セクション** (`activeSection`) の状態を渡す —— 固定で `section` のまま
  // だと、スレッドを開いている間にスレッド側のリレーが到達不能でも
  // バッジが黙ったままになり、developer mode でしか気付けない
  // (`unreachableRelays` は診断値として developer mode の背後にしか出ない)。
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
    const merged = mergeProjectedEvents(
      section.items(),
      props.optimisticEvents(),
      source().filters,
    );
    // 通知列でだけ自分の行動を落とす (仕様 2.2 節)。**捨てるのはセクションが
    // 保持した後**なので、保持上限 200 件は捨てる前の件数で数えている ——
    // 自分の行動が多いと見える件数がそのぶん減る。仕様 5.1 節がこの代償を
    // 受け入れた判断として記録している。
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
   * 返信を署名直後に開いているスレッドへ重ねる。SectionReader はリレーから
   * 戻ったイベントだけを持つので、根カラムと同じ id 重複排除をここでも
   * 行う。thread source の filters を使うため、別スレッドへの返信や通常の
   * 新規投稿は混ざらない。
   */
  const threadItems = createMemo(() =>
    mergeProjectedEvents(
      threadSection.items(),
      props.optimisticEvents(),
      threadSource.source().filters,
    ),
  );

  // `items()` が空でなくなるたびに親へ知らせる (task-5-brief.md Step 1)。
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
      // 幅 380 (v0 は 400)。ヘッダーはカラムと一緒にスクロールさせず、
      // 上端に貼り付ける —— 長いタイムラインの途中でカラムを取り違えない
      // ようにするため、名前と操作は常に見えている必要がある。
      class="flex h-full w-95 shrink-0 flex-col overflow-hidden border-r last:border-r-0"
    >
      {/*
        カラムの識別色 (3px)。**カラムを見分ける手掛かりを色に持たせる**
        のが目的で、ヘッダーの文字とは別の層で効く —— 横に並んだ 4 本の
        カラムをスクロール中に区別するとき、人は先に色を見る。
        現状は全カラム共通のアクセント色。カラムごとに選ばせるのは別の話。
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
          {/*
            スレッドを開いている間は「カラムを左へ」を隠さず、戻るボタンに
            差し替える —— 左端のボタンが常に 1 つという配置を保ったまま、
            スタックを 1 段だけ pop する (根まで戻ればカラムに戻る)。
          */}
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
              // 持たないことになる (biome lint/a11y)。見出しレベルは h2 が
              // 保ち、実際にクリック/キー操作を受けるのは中の button ——
              // button ならフォーカスと Enter/Space での起動をブラウザが
              // 標準で面倒を見るので、手書きの onKeyDown が要らない。
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
        ADR-0026: `status.incomplete` は行動できない診断値であり、開発者
        モードが有効なときだけ出す (計算自体は developerMode の有無に関わらず
        常に正しく続く —— ここで隠れるのは表示だけ)。行動できる異常
        (unreachableRelays かつ明示リレー) は `ColumnAlertBadge` が別枠で
        常時出す。

        仕様 7 節が要求していた「生の数値をそのまま見せる」は、ADR-0026 に
        より「開発者モードの背後でそのまま見せる」へ改まった (ADR-0011 の
        改訂と同じ扱い)。
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
        スクロールするのは本文だけ。ヘッダーは `section` 直下に残して
        貼り付ける。**この容器が e2e の掴み先** (`column-scroll`) ——
        `section` 自体をスクロールさせていた頃の名残で `deck-column` を
        掴むと、ヘッダーを固定した瞬間に静かに何もスクロールしなくなる。
      */}
      <div data-testid="column-scroll" class="min-h-0 flex-1 overflow-y-auto">
        {/*
          `open` でスタックへ push する —— ノートのクリックハンドラ
          (`Note.tsx`) がこれを呼ぶ。根のカラムだけでなく、スレッド内の
          祖先・返信を押しても新しい背骨に引き直せるよう、本文全体を
          この provider の中に置く。
        */}
        <ThreadNavProvider open={openThread}>
          <Show when={focusId()} fallback={<ColumnItems items={items} />}>
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
