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
import EventActionBar from "../EventActionBar";
import EventMenu from "../EventMenu";
import EventView from "../EventView";
import NestedEventCard from "../NestedEventCard";
import NoteContent from "../NoteContent";
import Profile from "../Profile";
import ReactionList from "../ReactionList";
import { useThreadNav } from "../thread-nav";

const MAX_CONTENT_HEIGHT = 400;

/** これ以上動いたら「押した」ではなく「選択した」とみなす。 */
const DRAG_SLOP = 4;

/**
 * `<article>` の click をスレッドを開く操作に変える。入れ子は内側が勝つ
 * (stopPropagation)。
 *
 * Solid の delegated click は document 直下で拾い `_$host` を辿るため、
 * Portal 経由で本文と無関係な場所に描かれる要素 (EventMenu 等) の click も
 * 届いてしまう —— `e.target` が実 DOM 上でこの article の子孫かを
 * `contains()` で確かめて弾く。
 *
 * リンク・ボタン・`[data-part='trigger']` などの対話要素上、ドラッグで
 * 選択した後 (mousedown/mouseup の座標が動いた場合)、`disabled`
 * (ThreadView の focus 行) のときは発火しない。
 *
 * 戻り値は 1 度だけ受け取って 3 か所へ配る。`enabled` は関数のまま渡し
 * 反応性を保ち、ハンドラは安定参照にする (class を 2 回書くと静的
 * クラスが消える事故を避けるため)。
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
 * 本文の高さ制限と展開ボタン。文字数や行数からの推定はフォント・折返し・
 * 絵文字でずれるので、実際にレンダリングされた高さを測る。
 * `observeHeight` で `ResizeObserver` を全ノートで共有する —— 呼び出し
 * ごとに新規作成する `createElementSize` だとノート数だけ増えて重い。
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
          // `bg-transparent` が要る: UA 既定の button 背景 (buttonface) は
          // `appearance-none` では消えず、グラデーションの下から灰色が
          // 透ける。始点を `transparent` でなく同色の不透明度 0 にするのは
          // 補間空間によって `transparent` だと灰色を経由しうるため。
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
 * アイコン列と本文列の 2 列。grid でなく flex なのは、縦線 (threadLine) が
 * アイコン下端からブロック下端まで伸びる必要があり、`self-stretch` +
 * `flex-1` でしか表せないため。空白のみの本文も器ごと出さない。
 * `children` (引用カード) は本文列の中に置く —— アイコンの右に揃えないと
 * 誰への引用か読めなくなる。
 */
const NoteBody: ParentComponent<{
  event: NostrEvent;
  variant: EventVariant;
  threadLine?: boolean;
  /** 返信先の著者。本文の直前に `@name` を出す。 */
  replyTo?: string;
}> = (props) => {
  const ctx = useRender();
  const hasContent = () => props.event.content.trim().length > 0;
  const created = () => new Date(props.event.created_at * 1000);
  const isFull = () => props.variant === "full";

  return (
    <div
      class="flex items-start"
      // 縦線で繋がる行は full と同じ 40px 格子に乗せる —— compact の
      // w-8 アイコンのままだと列中心が 4px ずれ、線が折れて見える。
      classList={{
        "gap-3": isFull() || !!props.threadLine,
        "gap-2": !isFull() && !props.threadLine,
      }}
    >
      <div
        class="flex shrink-0 flex-col items-center self-stretch"
        classList={{ "w-10": !isFull() && !!props.threadLine }}
      >
        <Avatar pubkey={props.event.pubkey} size={props.variant} />
        <Show when={props.threadLine}>
          {/*
            min-h-2 で線の最低長を確保する (短い返信だと余りが負になり
            線が消えるのを防ぐ)。-mb-2 で 8px はみ出させ、行間の空きを
            線が跨ぐようにする。位置は items-center 任せにして、variant
            ごとに違うアイコン幅を外から決め打ちしない。
          */}
          <div
            data-testid="thread-line"
            class="-mb-2 min-h-2 w-0.5 flex-1 bg-tertiary"
          />
        </Show>
      </div>
      <div
        class="flex min-w-0 flex-1 flex-col"
        classList={{ "gap-2": isFull(), "gap-1.5": !isFull() }}
      >
        {/*
          省略されるのは名前だけ —— 時刻とメニューは shrink-0 で幅を
          譲らない。時刻はタイムラインで最も走査され、名前は隣のアイコン
          とホバーカードで補える。
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
            full にだけ出す —— compact の置き場所は外側が既にメニューを
            持ち、⋮ が並ぶのを避ける。入れ子は開いた先で操作する。
          */}
          <Show when={isFull()}>
            <EventMenu event={props.event} />
          </Show>
        </div>
        <div class="flex flex-col gap-1">
          {/*
            返信先の宛名は本文より一段落とす。太字で目立たせると本文より
            先に目に入る。text-link (下線) も使わない —— 押してもまだ
            何も起きないので、押せる合図を出すと壊れて見える。
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
                // full は本文位置に埋め込む。compact は関連イベントを
                // 要求しない規則があるのでテキストのまま。
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
 * kind:1 の詳細表示。`replyTarget`/`tagOnlyQuoteTargets` は純関数で、
 * 取得を発行しない —— 実際の取得は結果を渡した先の `EventView` が行う。
 * 返信先は骨格の外に積み縦線で繋ぐ (別イベントの compact 描画)。
 * タグにしか無い引用は骨格の中、本文列の下に本文の左端揃えで置く。
 */
export const NoteFull: Component<EventBodyProps> = (props) => {
  const reply = () => replyTarget(props.event);
  // 本文中の nostr: 引用は NoteContent が描くので、ここはタグにしか
  // 無い引用だけ。
  const quotes = () => tagOnlyQuoteTargets(props.event);
  const openOnClick = useOpenThreadOnClick(
    () => props.event,
    () => props.disableThreadOpen === true,
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボード操作でスレッドを開く経路が無い (followups: docs/design/read-layer-followups.md の「キーボードではスレッドを開けない」節)。押せるのはポインタ操作のみ。
    <article
      data-testid="note"
      // group/event: ReactionList の展開トグルがホバー時だけ出る判定は
      // この祖先の named group に依存する。
      //
      // group-[_]/event:p-0: リポスト/リアクション対象は full で描くので
      // このノートがその枠の中にそのまま入る。祖先に group/event がある
      // とき (= 入れ子のとき) だけ padding を 0 にし、置く側と重複しない
      // ようにする。最外周のノートにはこのセレクタが効かず padding が残る。
      //
      // 押せる見た目とハンドラは classList/個別 props で足す —— class を
      // 2 回書くと後勝ちで静的クラスが消えるため。
      class="group/event p-3 text-body group-[_]/event:p-0"
      classList={{ "cursor-pointer": openOnClick.enabled() }}
      onMouseDown={openOnClick.onMouseDown}
      onClick={openOnClick.onClick}
    >
      {/*
        返信先は枠なしで本体の上に積み、縦線で繋ぐ —— 枠は「別投稿の
        引用」を意味するため。親が未着でも EventView が読み込み中を出す
        ので待たない。hideReplyPreview のときは出さない (ThreadView の
        focus 行では親が祖先として既に画面にあり、二重に並ぶため)。
      */}
      <Show when={!props.hideReplyPreview && reply()}>
        {(ref) => (
          // pb-2 で返信先と本体を空ける —— 詰めると 1 件の投稿に見える。
          // この 8px は縦線が跨ぐ。
          <div class="pb-2">
            <EventView
              id={ref().id}
              variant="compact"
              relayHint={ref().relay}
              threadLine
            />
          </div>
        )}
      </Show>

      <NoteBody
        event={props.event}
        variant="full"
        threadLine={props.threadLine}
        replyTo={reply()?.pubkey}
      >
        {/*
          タグにしか無い引用 (本文埋め込みは NoteContent が描く)。q タグが
          event-address を指す場合は置換可能イベント取得が範囲外なので
          「未対応の参照です」を出す。
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
        {/* NoteCompact には出さない —— compact は関連イベントを要求
            しない規則をリアクション取得にも適用する。 */}
        <ReactionList eventId={props.event.id} />
        <Show when={!props.hideActions}>
          <EventActionBar event={props.event} />
        </Show>
      </NoteBody>
    </article>
  );
};

/**
 * kind:1 の小型表示。`replyTarget`/`tagOnlyQuoteTargets` を呼ばないのは、
 * 呼ばないと決めることで「compact は関連イベントを要求しない」規則が
 * コードを読むだけで確認できるため。
 *
 * padding を持たない —— 置かれる先 (引用カード・返信先) が既に余白を
 * 取っているので、ここで足すと二重になる。padding を足したくなったら
 * それは置く側の責務。
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
