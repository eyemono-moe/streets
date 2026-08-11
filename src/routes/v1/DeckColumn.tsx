import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { columnAlerts } from "../../core/deck/column-alerts";
import type { ColumnDef } from "../../core/deck/deck";
import { resolveSource } from "../../core/deck/resolve-source";
import type { NostrEvent } from "../../core/nostr/event";
import { matchesAnyFilter } from "../../core/read/filter-match";
import type { NostrSource } from "../../core/read/source";
import type { SubscriptionManager } from "../../core/read/subscription-manager";
import { createSection } from "../../core/solid/create-section";
import ColumnAlertBadge from "./ColumnAlertBadge";
import DiagnosticsPanel from "./DiagnosticsPanel";
import EventView from "./EventView";
import { parseRelays } from "./parse-relays";

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
 * `?relays=` (RELAYS_OVERRIDE) が効いている間は、明示リレーを持つカラム
 * (`defaultDeck` の "global" 列など) の `relays` もローカルリレーへ
 * 差し替える。これをしないと `defaultDeck` が焼き込んだ本物のリレー
 * (`FALLBACK_RELAYS`) へ e2e が外部ネットワーク越しに繋ぎに行ってしまい、
 * ローカルシードでは検証できなくなる — `fallbackRelays`/`indexers` に
 * 対する上と同じ上書きの立て付け。
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
   * 投稿フォームが署名直後に楽観挿入した、まだリレーから戻って
   * きていない自分の投稿。`SectionReader` は購読経由でしか items を更新
   * できない (`store.put()` を直接呼んでも拾わない) ので、表示側でこの
   * リストを重ね合わせる。
   */
  optimisticEvents: () => NostrEvent[];
  /**
   * 開発者モードが有効かどうか (ADR-0026)。`deck-column-phase` /
   * `deck-column-incomplete` (診断値) の描画条件としてのみ使う ——
   * `ColumnAlertBadge` (行動できる異常) はこれを見ない。
   */
  developerMode: () => boolean;
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
  const source = createMemo<NostrSource>(() => {
    // `followees: props.followees` (呼ばずに渡す) —— `resolveSource` が
    // `kind: "followees"` の分岐でだけこれを呼ぶ (`resolve-source.ts` の
    // コメント参照)。ここで `props.followees()` と呼んで値を渡してしまうと、
    // `literal` 列でもこの memo が warmUp の結果 (フォローリストのリソース)
    // を読んだことになり、ウォームアップが settle するたびに全カラムが
    // 再購読される (最終レビュー Important 1)。
    const resolved = resolveSource(props.column.source, {
      followees: props.followees,
    });
    // `?relays=` の e2e 上書きは**解決した後**に当てる —— 上書きが見るのは
    // `NostrSource.relays` であって `ColumnSource` ではない。順序を逆に
    // すると、明示リレーを持つカラムがローカルリレーへ差し替わらず、
    // e2e が外部ネットワークへ繋ぎに行く。
    return RELAYS_OVERRIDE && resolved.relays
      ? { ...resolved, relays: RELAYS_OVERRIDE }
      : resolved;
  });

  const section = createSection({
    source,
    manager: props.manager,
  });

  // ユーザーが行動できる異常だけを取り出す (ADR-0026)。判定そのものは
  // columnAlerts (Task 2) に集約済みで、ここでは呼ぶだけ。
  const alerts = createMemo(() => columnAlerts(props.column, section.status()));

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
      class="h-full w-100 shrink-0 overflow-y-auto border-r last:border-r-0"
    >
      <header class="flex items-center gap-1 p-2">
        <button
          type="button"
          data-testid="column-move-left"
          class="shrink-0 rounded-full px-2 py-1 text-xs enabled:cursor-pointer disabled:opacity-30"
          disabled={!props.canMoveLeft()}
          onClick={props.onMoveLeft}
        >
          ←
        </button>

        <Show
          when={editingTitle()}
          fallback={
            // h2 に直接 onClick を付けると非対話要素がキーボード操作を
            // 持たないことになる (biome lint/a11y)。見出しレベルは h2 が
            // 保ち、実際にクリック/キー操作を受けるのは中の button ——
            // button ならフォーカスと Enter/Space での起動をブラウザが
            // 標準で面倒を見るので、手書きの onKeyDown が要らない。
            <h2 class="min-w-0 flex-1 truncate font-bold">
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

        <ColumnAlertBadge alerts={alerts} />

        <button
          type="button"
          data-testid="column-move-right"
          class="shrink-0 rounded-full px-2 py-1 text-xs enabled:cursor-pointer disabled:opacity-30"
          disabled={!props.canMoveRight()}
          onClick={props.onMoveRight}
        >
          →
        </button>
        <button
          type="button"
          data-testid="column-remove"
          class="shrink-0 rounded-full px-2 py-1 text-xs enabled:cursor-pointer"
          onClick={props.onRemove}
        >
          ×
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
      <DiagnosticsPanel visible={props.developerMode}>
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
            phase: {section.status().phase}
          </p>
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
        </div>
      </DiagnosticsPanel>
      {/*
        1 件ずつをカードにせず `divide-y` で区切る (v0 の `InfiniteEvents`
        と同じ)。イベント側が枠を持つと、引用・返信先として入れ子に置かれた
        ときの枠 (`Note.tsx` の `NestedEventCard`) と見分けが付かなくなる。
        区切り線がカラム幅いっぱいに伸びる必要があるので、左右の余白は
        ここではなくイベント側 (`p-2`) が持つ。
      */}
      <ul data-testid="items" class="divide-y">
        <For each={items()}>
          {(event) => (
            <li data-testid="item">
              <EventView id={event.id} variant="full" />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
};

export default DeckColumn;
