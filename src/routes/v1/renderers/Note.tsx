import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import {
  replyTarget,
  tagOnlyQuoteTargets,
} from "../../../core/nostr/event-refs";
import {
  formatEventTime,
  formatEventTimeFull,
} from "../../../core/view/format-time";
import { useRender } from "../../../core/view/render-context";
import type {
  EventBodyProps,
  EventVariant,
} from "../../../core/view/renderer-registry";
import { observeHeight } from "../../../core/view/shared-resize-observer";
import Avatar from "../Avatar";
import EventMenu from "../EventMenu";
import EventView from "../EventView";
import NestedEventCard from "../NestedEventCard";
import NoteContent from "../NoteContent";
import Profile from "../Profile";
import ReactionList from "../ReactionList";
import { useThreadNav } from "../thread-nav";

/**
 * 本文を折り畳む高さ (spec 3 節)。v0 の `EventBase` と同じしきい値。
 */
const MAX_CONTENT_HEIGHT = 400;

/** これ以上動いたら「押した」ではなく「選択した」とみなす。 */
const DRAG_SLOP = 4;

/**
 * `<article>` の click を「このイベントのスレッドを開く」に変える。
 *
 * **入れ子は内側が勝つ。**引用カードや返信先の中のノートを押したら、
 * 内側の `<article>` がここで `stopPropagation()` するので外側へ届かない。
 * 深さに関係なく同じ規則で効く。
 *
 * **`e.target` が実 DOM 上でこの `<article>` の子孫であることを要求する。**
 * Solid の delegated event は document 直下で拾い、`node._$host ||
 * node.parentNode` を辿って伝播経路を組み立てる —— `<Portal>` は自分の
 * コンテナに `_$host` を張るので、`EventMenu`/`ProfileHover` のように
 * 本文とは無関係な場所 (`document.body` 直下など) へ描画される内容の
 * click も、DOM 上の位置に関係なくここまで届いてしまう。`role='menuitem'`
 * のような、たまたま selector に引っかからない部品が中にあると、
 * 「対話要素なので無視する」判定をすり抜けてスレッドが開いてしまう。
 * `closest()` による selector 一致は「Portal の中に何があるか」を
 * 列挙する形になり、ark-ui の面が増えるたびに直し忘れる。実 DOM の
 * 包含関係を見れば、Portal 経由の click は列挙なしに一律で弾ける ——
 * `e.currentTarget` はハンドラを登録した実ノード (= この `<article>`)
 * そのものなので、ref を別途持たなくても `contains()` の起点に使える。
 *
 * 対話要素の上では発火しない —— リンク・名前・アクション列はそれぞれ
 * 自分の目的地を持つ。`closest()` で祖先まで見るのは、押されたのが
 * `<button>` の中の `<span>` でも同じ判定になるようにするため。
 * `[data-part='trigger']` を加えているのは、`ProfileHover` が `asChild`
 * で `Avatar` の `<div>` へ合流させるトリガーが zag の `getTriggerProps()`
 * から `role` を受け取らないため —— タグ名や role に関わらず、ark-ui が
 * 自分の anatomy として "trigger" と呼ぶ部品には常にこの data 属性が付く
 * ので、`<button>` 版のトリガー (名前) と `asChild` 版のトリガー (アイコン)
 * を同じ 1 つの判定で揃えられる。
 *
 * ドラッグで本文を選択した後も発火しない。`mousedown` と `mouseup` の
 * 座標が動いていたら選択の意図とみなす —— そうしないと本文をコピー
 * しようとするたびにスレッドが開く。
 *
 * `disabled` (`ThreadView` が背骨の focus に立てる) が真なら、押せる見た目
 * も handler も付けない —— focus 自身を押しても、ナビゲーションスタックの
 * 重複 push ガード (`DeckColumn.tsx` の `openThread`) により何も起きない
 * ので、ADR-0026 に従いその no-op を最初から押せる見た目にしない。
 *
 * **戻り値は 1 度だけ呼び出し側で受け取り、そのまま 3 か所へ配る。**
 * `enabled` を関数 (呼び出し側の `classList` の中で読むことで反応性を保つ)
 * に、`onMouseDown`/`onClick` を安定した関数参照にしてある —— `class` の
 * ような「文字列を返すが実際には真偽値としてしか使わない」形は、`class` を
 * 2 回書くと後勝ちで静的クラスが消える、という `<article>` 側のコメントが
 * 警告している事故をそのまま誘う。
 */
const useOpenThreadOnClick = (
  event: () => NostrEvent,
  disabled: () => boolean = () => false,
) => {
  const open = useThreadNav();
  let downAt: { x: number; y: number } | undefined;

  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest(
      "a, button, [role='button'], input, textarea, [data-part='trigger']",
    ) !== null;

  const enabled = () => open !== undefined && !disabled();

  return {
    enabled,
    onMouseDown: (e: MouseEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    },
    onClick: (e: MouseEvent) => {
      if (!enabled()) return;
      const article = e.currentTarget;
      if (
        !(article instanceof Element) ||
        !(e.target instanceof Node) ||
        !article.contains(e.target)
      ) {
        return;
      }
      if (isInteractive(e.target)) return;
      const moved =
        downAt !== undefined &&
        (Math.abs(e.clientX - downAt.x) > DRAG_SLOP ||
          Math.abs(e.clientY - downAt.y) > DRAG_SLOP);
      if (moved) return;
      e.stopPropagation();
      open?.(event().id);
    },
  };
};

/**
 * 本文の高さ制限と展開ボタン (spec 3 節)。文字数や行数からの推定は
 * フォント・折返し・絵文字の連続で簡単にずれるので、**実際にレンダリング
 * された高さ**を測る。`compact` でも同じ仕組みを通す (v0 は `small` でも
 * `EventBase` を通る)。
 *
 * 監視は `observeHeight` (全ノートで 1 つの `ResizeObserver` を共有) を
 * 通す —— `@solid-primitives/resize-observer` の `createElementSize` は
 * 呼び出しごとに新しいインスタンスを作るので、ノート 1 件につき 1 個
 * 増えてスクロール中の 1 フレームのコストに直接乗る (実測あり)。
 */
const CollapsibleBody: ParentComponent = (props) => {
  const [wrapper, setWrapper] = createSignal<HTMLDivElement>();
  const [height, setHeight] = createSignal(0);
  const [expanded, setExpanded] = createSignal(false);
  const isOverflown = () => height() >= MAX_CONTENT_HEIGHT;

  createEffect(() => {
    const element = wrapper();
    if (!element) return;
    onCleanup(observeHeight(element, setHeight));
  });

  return (
    <div class="relative">
      <div
        ref={setWrapper}
        class="overflow-hidden"
        style={{
          "max-height": expanded() ? "none" : `${MAX_CONTENT_HEIGHT}px`,
        }}
      >
        {props.children}
      </div>
      <Show when={isOverflown() && !expanded()}>
        <button
          type="button"
          data-testid="note-expand"
          // **`bg-transparent` が要る。** `<button>` の UA 既定背景は
          // `buttonface` (Chromium では不透明な #efefef) で、`appearance-none`
          // はこれを消さない。背景色はグラデーション (background-image) の
          // 下に敷かれるので、透明から始めたはずのぼかしの上端から灰色が
          // 透ける (実測: computed backgroundColor が rgb(239,239,239))。
          //
          // 始点を `transparent` ではなく終点と同じ色の不透明度 0 にして
          // あるのは、補間方法に依存しないため —— 現行の Chromium は
          // `in oklch` の乗算済みアルファで補間するので `transparent` でも
          // 同じ結果になるが、補間空間の指定が外れた環境では
          // `rgba(0,0,0,0)` からの補間が灰色を経由しうる。
          class="absolute bottom-0 flex w-full cursor-s-resize appearance-none justify-center bg-gradient-to-b bg-transparent from-white/0 to-white pt-4 text-caption dark:from-ui-950/0 dark:to-ui-950"
          onClick={() => setExpanded(true)}
        >
          <span class="flex items-center gap-1 rounded bg-tertiary px-2 py-0.5">
            <span class="i-material-symbols:expand-more-rounded h-1.25lh w-auto" />
            <span>さらに表示</span>
          </span>
        </button>
      </Show>
    </div>
  );
};

/**
 * 骨格そのもの: アイコン列と本文列の 2 列。**grid ではなく flex** ——
 * 縦線 (`threadLine`) はアイコンの下端からブロックの下端まで伸びる必要が
 * あり、それは「アイコン列が親の高さいっぱいに伸びて、余りを線が食う」
 * (`self-stretch` + `flex-1`) でしか表せない。
 *
 * 本文が空なら本文の器ごと出さない (design 6 節) —— 空文字列だけでなく
 * 空白だけの本文も「無い」として扱う。visually empty な本文の下に
 * 折り畳みの器や余白だけが残るのを避けるため。
 *
 * `children` は本文の下 (引用カード) に入る。`article` 直下ではなく
 * **本文列の中**に置く —— アイコンの右側に揃えないと、引用がアイコンの
 * 下へ回り込んで誰の投稿への引用なのか読めなくなる。
 */
const NoteBody: ParentComponent<{
  event: NostrEvent;
  variant: EventVariant;
  threadLine?: "flush" | "spill";
  /** 返信先の著者。本文の直前に `@name` を出す (design 5 節)。 */
  replyTo?: string;
}> = (props) => {
  const ctx = useRender();
  const hasContent = () => props.event.content.trim().length > 0;
  const created = () => new Date(props.event.created_at * 1000);
  const isFull = () => props.variant === "full";

  return (
    <div
      class="flex items-start"
      // 縦線で繋がる行は `full` と同じ格子に乗せる (`gap-3` + 40px の
      // アイコン列)。compact のアイコンは `w-8` なので、そのままだと列の
      // 中心が 4px 左にずれ、線が次の行のアイコンの中心から外れて折れて
      // 見える —— アイコンは `items-center` で 40px の列の中央に置く。
      classList={{
        "gap-3": isFull() || props.threadLine !== undefined,
        "gap-2": !isFull() && props.threadLine === undefined,
      }}
    >
      <div
        class="flex shrink-0 flex-col items-center self-stretch"
        classList={{ "w-10": !isFull() && props.threadLine !== undefined }}
      >
        <Avatar pubkey={props.event.pubkey} size={props.variant} />
        <Show when={props.threadLine}>
          {/*
            スレッドの縦線。`min-h-2` で最低限の長さを確保する ——
            本文がアイコンより短い返信 (「了解」だけ、など) では余りが
            負になり、線がまったく描かれずに親子の繋がりが消える。
          */}
          {/*
            `spill` の `-mb-2`: 線を `<article>` の下へ 8px はみ出させる。
            置く側 (`ThreadView`) が行と行の間に余白を持つので、線が自分の
            行の高さで止まると必ずそこで切れる。**位置合わせを置く側の
            絶対配置に任せない** —— アイコン幅は variant ごとに違い
            (`w-8`/`w-10`)、外から座標を決め打ちすると線が 1px ずれる。
            ここなら `items-center` にそのまま乗る。
          */}
          <div
            data-testid="thread-line"
            class="min-h-2 w-0.5 flex-1 bg-tertiary"
            classList={{ "-mb-2": props.threadLine === "spill" }}
          />
        </Show>
      </div>
      <div
        class="flex min-w-0 flex-1 flex-col"
        classList={{ "gap-2": isFull(), "gap-1.5": !isFull() }}
      >
        {/*
          名前・時刻・メニューの 3 つ。**省略されるのは名前だけ** ——
          時刻とメニューは `shrink-0` で幅を譲らない。時刻はタイムラインで
          最も走査されるメタ情報であり、長い形式 (`yyyy/MM/dd HH:mm`) に
          なるほど古い投稿だと分かる情報量が増える。名前は隣のアイコンと
          ホバーカードで補える。
        */}
        <div
          class="flex items-end gap-1.5 overflow-hidden"
          classList={{ "text-caption": isFull(), "text-xs": !isFull() }}
        >
          <p data-testid="note-author" class="min-w-0 flex-1 truncate">
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
              variant="author"
            />
          </p>
          <span
            data-testid="note-created-at"
            class="c-secondary shrink-0 text-nowrap"
            title={formatEventTimeFull(created())}
          >
            {formatEventTime(created(), new Date())}
          </span>
          {/*
            `full` にだけ出す。`compact` が置かれる先 (引用カード・返信先)
            は既に外側のイベントがメニューを持っており、1 行に ⋮ が 2 つ
            3 つと並ぶのを避ける —— 入れ子のイベントは開いた先で操作する。
          */}
          <Show when={isFull()}>
            <EventMenu event={props.event} />
          </Show>
        </div>
        <div class="flex flex-col gap-1">
          {/*
            返信先の宛先。**本文より一段落とす** —— これは本文ではなく
            「誰に向けたものか」という宛名で、アクセント色の太字で置くと
            本文より先に目に入り、1 列に並んだときスレッドの本文が読め
            なくなる。`text-link` (hover で下線が出る) も使わない ——
            押してもまだ何も起きない (ユーザーカラムは #205)。押せる合図を
            先に出すと「未実装」と「壊れている」が区別できなくなる
            (ADR-0026)。
          */}
          <Show when={props.replyTo}>
            {(pubkey) => (
              <p
                data-testid="reply-to"
                class="c-secondary flex min-w-0 gap-1 text-caption"
              >
                <span class="shrink-0">返信先</span>
                <span class="min-w-0 truncate">
                  <Profile
                    pubkey={pubkey()}
                    store={ctx.store}
                    requests={ctx.profiles}
                  />
                </span>
              </p>
            )}
          </Show>
          <Show when={hasContent()}>
            <CollapsibleBody>
              <NoteContent
                content={props.event.content}
                tags={props.event.tags}
                variant={props.variant}
                // full は本文の位置に埋め込む (仕様 4.2 節)。compact は
                // 関連イベントを一切要求しないという規則があるので、
                // 埋め込まずテキストにする。
                eventRefs={props.variant === "full" ? "embed" : "text"}
              />
            </CollapsibleBody>
          </Show>
        </div>
        {props.children}
      </div>
    </div>
  );
};

/**
 * kind:1 の詳細表示 (spec 6 節の表)。
 *
 * `replyTarget`/`tagOnlyQuoteTargets` は `event-refs.ts` の純関数 ——
 * 呼ぶだけでは何も取得しない。実際に取得を発行しうるのは、その結果を
 * `<EventView variant="compact">` へ渡した先だけ (`EventView` が store に
 * 無ければ `events.request` を呼ぶ)。本文の位置に埋め込む引用
 * (`NoteContent`/`eventRefs="embed"`) も同じ経路を通る。
 *
 * 返信先は骨格の**外** (上に積む独立したブロック)、タグにしか無い引用は
 * 骨格の**中** (本文列の下)。返信先は自分自身の骨格を持つ別イベントの
 * `compact` 描画であり、スレッドの縦線で本体と繋がる。引用は本文に付属
 * する参照なので本文の左端に揃える。
 */
export const NoteFull: Component<EventBodyProps> = (props) => {
  const reply = () => replyTarget(props.event);
  // 本文に `nostr:` として現れた引用は `NoteContent` がその位置に描く
  // (仕様 4.2 節)。ここに残るのは **タグにしか無いもの** だけ。
  const quotes = () => tagOnlyQuoteTargets(props.event);
  const openOnClick = useOpenThreadOnClick(
    () => props.event,
    () => props.disableThreadOpen === true,
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボード操作でスレッドを開く経路が無い (followups: docs/design/read-layer-followups.md の「キーボードではスレッドを開けない」節)。押せるのはポインタ操作のみ。
    <article
      data-testid="note"
      // `group/event`: `ReactionList` の展開トグルが `group-not-hover/event:hidden`
      // でホバー時だけ出す (spec 5 節) —— その判定はこの祖先が名前付き
      // group を持っていて初めて働く (v0 の `EventBase.tsx` と同じ立て付け)。
      //
      // `group-[_]/event:p-0`: リポスト・リアクションの対象は `full` で
      // 描く (spec 3 節) ため、`RepostFull`/`ReactionFull` の枠の中に
      // このノートがそのまま入る。祖先に `group/event` が既にあるとき
      // (= 自分がその枠の中にいるとき) だけ padding を 0 にして、置く側
      // (`RepostFull`/`ReactionFull`) の padding と足し合わさらないように
      // する (v0 の `EventBase.tsx` と同じ手筋)。一番外側のノートには
      // 祖先の `group/event` が無いので、このセレクタは効かず padding が
      // 残る。
      //
      // 押せる見た目 (`cursor-pointer`) とハンドラは `classList`/個別の
      // props で足す —— `class` を 2 回書くと後勝ちで上の静的クラスが
      // 消える (ADR-0026: `enabled()` が false なら押せる見た目にしない —
      // `useThreadNav()` が `undefined` のときも、`disableThreadOpen` が
      // 立っているときも同じ扱い)。
      class="group/event p-3 text-body group-[_]/event:p-0"
      classList={{ "cursor-pointer": openOnClick.enabled() }}
      onMouseDown={openOnClick.onMouseDown}
      onClick={openOnClick.onClick}
    >
      {/*
        返信先の親イベントは本体の上に、**枠を持たずに**積む。枠は
        「別の投稿の引用」を意味し、返信先は「同じ会話の続き」なので、
        代わりにアイコンの下から伸びる縦線 (`threadLine`) で繋ぐ。
        親イベント本体がまだ届いていなくても `EventView` が「読み込み中」を
        出すので、ここは到着を待たない。誰への返信かは `replyTo` として
        本体側が `e` タグの 5 番目の要素 (NIP-10、spec 5 節) から即座に出す。

        `hideReplyPreview` が立っているときは出さない —— `ThreadView` が
        背骨の focus をこの `full` で描くとき、この親は既に祖先の最後の
        1 件として画面に出ているので、ここでも積むと同じイベントが縦に
        2 回並ぶ (`ThreadView.tsx` 参照)。
      */}
      <Show when={!props.hideReplyPreview && reply()}>
        {(ref) => (
          <EventView
            id={ref().id}
            variant="compact"
            relayHint={ref().relay}
            threadLine="flush"
          />
        )}
      </Show>

      <NoteBody
        event={props.event}
        variant="full"
        threadLine={props.threadLine}
        replyTo={reply()?.pubkey}
      >
        {/*
          タグにしか無い引用先 (本文の位置に埋め込まれたものは `NoteContent`
          が描くので、ここには来ない)。`q` タグが event-address
          (`form: "address"`) を指す場合は置換可能イベントの取得が範囲外
          (spec 9 節) なので、`compact` の代わりに「未対応の参照です」を出す。
        */}
        <For each={quotes()}>
          {(ref) =>
            ref.form === "id" ? (
              <NestedEventCard>
                <EventView
                  id={ref.id}
                  variant="compact"
                  relayHint={ref.relay}
                />
              </NestedEventCard>
            ) : (
              <p data-testid="unsupported-ref" class="c-secondary text-caption">
                未対応の参照です
              </p>
            )
          }
        </For>
        {/*
          リアクション一覧 (spec 5 節)。`NoteCompact` には出さない ——
          compact は関連イベントを一切要求しないという規則を、リアクション
          取得の要求 (`ctx.reactions.request`) にも適用する。
        */}
        <ReactionList eventId={props.event.id} />
      </NoteBody>
    </article>
  );
};

/**
 * kind:1 の小型表示 (spec 6 節の表)。**`replyTarget`/`tagOnlyQuoteTargets` を
 * 一切呼ばない** —— 呼ぶこと自体は無害 (純関数) だが、呼ばないと決めて
 * おくことで「関連イベントを一切要求しない」という compact の規則が
 * コードを読むだけで確認できる (この規則が壊れていないかは
 * `Note.test.tsx` がユニットテストで直接主張する)。
 *
 * **padding を持たない。** compact が置かれる先 (`NestedEventCard` の引用
 * カード、返信先) は常に置く側が既に余白・枠を取っているので、ここで
 * p-2 等を足すと二重になる。`NoteFull`/`RepostFull`/`ReactionFull` は
 * これとは別の入れ子 —— 対象を `full` のまま入れ子にするので (spec 3 節)
 * 自分の padding を残しつつ `group-[_]/event:p-0` で祖先の中でだけ 0 に
 * 上書きする (v0 の `EventBase.tsx` と同じ手筋、`Note.tsx` の
 * `NoteFull` を参照)。compact は最初から一度も padding を持たないので、
 * その上書きが要らない。
 * **次の変更者へ**: ここに padding を足したくなったら、それは compact の
 * 責務ではなく置く側 (引用カード等) の責務。
 */
export const NoteCompact: Component<EventBodyProps> = (props) => {
  const openOnClick = useOpenThreadOnClick(
    () => props.event,
    () => props.disableThreadOpen === true,
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボード操作でスレッドを開く経路が無い (followups: docs/design/read-layer-followups.md の「キーボードではスレッドを開けない」節)。押せるのはポインタ操作のみ。
    <article
      data-testid="note"
      class="text-caption"
      classList={{ "cursor-pointer": openOnClick.enabled() }}
      onMouseDown={openOnClick.onMouseDown}
      onClick={openOnClick.onClick}
    >
      <NoteBody
        event={props.event}
        variant="compact"
        threadLine={props.threadLine}
      />
    </article>
  );
};
