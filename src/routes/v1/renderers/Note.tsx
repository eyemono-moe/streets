import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import {
  contentQuoteTargets,
  quoteTargets,
  replyTarget,
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
import EventView from "../EventView";
import NoteContent from "../NoteContent";
import Profile from "../Profile";

/**
 * 本文を折り畳む高さ (spec 3 節)。v0 の `EventBase` と同じしきい値。
 */
const MAX_CONTENT_HEIGHT = 400;

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
          // 始点は `transparent` ではなく**終点と同じ色の不透明度 0**。
          // CSS の `transparent` は `rgba(0, 0, 0, 0)` なので、白へ補間する
          // 途中が半透明の黒になり、ぼかしが灰色〜黒のグラデーションとして
          // 出てしまう。
          class="absolute bottom-0 flex w-full cursor-s-resize appearance-none justify-center bg-gradient-to-b from-white/0 to-white pt-4 text-caption dark:from-ui-950/0 dark:to-ui-950"
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
 * 入れ子のイベント (返信先・引用先) を囲む枠 (v0 の `RichContents` の引用
 * カードと同じ `b-1 rounded`)。**枠を描くのは置く側**という規則の実体で、
 * `NoteCompact` が padding を持たない (下のコメント) のと対になる ——
 * 余白と枠を 1 箇所で決めるので、入れ子が深くなっても二重にならない。
 *
 * トップレベルのイベント自身には枠が無い。v0 はカラムの一覧側が
 * `divide-y` で区切っており (`DeckColumn.tsx` の `<ul>` が同じ)、1 件ずつ
 * カードにすると入れ子の枠と見分けが付かなくなる。
 */
const NestedEventCard: ParentComponent = (props) => (
  <div class="b-1 overflow-hidden rounded p-1">{props.children}</div>
);

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
  threadLine?: boolean;
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
      classList={{ "gap-2": isFull(), "gap-1.5": !isFull() }}
    >
      <div class="flex shrink-0 flex-col items-center self-stretch">
        <Avatar pubkey={props.event.pubkey} size={props.variant} />
        <Show when={props.threadLine}>
          {/*
            スレッドの縦線。`min-h-2` で最低限の長さを確保する ——
            本文がアイコンより短い返信 (「了解」だけ、など) では余りが
            負になり、線がまったく描かれずに親子の繋がりが消える。
          */}
          <div
            data-testid="thread-line"
            class="min-h-2 w-0.5 flex-1 bg-tertiary"
          />
        </Show>
      </div>
      <div
        class="flex min-w-0 flex-1 flex-col"
        classList={{ "gap-1.5": isFull(), "gap-1": !isFull() }}
      >
        <div
          class="flex items-end gap-1 overflow-hidden"
          classList={{ "text-caption": isFull(), "text-xs": !isFull() }}
        >
          <p data-testid="note-author" class="min-w-0 truncate">
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
        </div>
        <div class="flex flex-col gap-1">
          {/*
            返信先の宛先。色は v0 の `EmbedUser` と同じアクセント色だが、
            `text-link` (hover で下線が出る) は使わない —— 押してもまだ
            何も起きない (ユーザーカラムは #205)。押せる合図を先に出すと
            「未実装」と「壊れている」が区別できなくなる (ADR-0026)。
          */}
          <Show when={props.replyTo}>
            {(pubkey) => (
              <p data-testid="reply-to" class="c-accent-5 font-700">
                <Profile
                  pubkey={pubkey()}
                  store={ctx.store}
                  requests={ctx.profiles}
                />
              </p>
            )}
          </Show>
          <Show when={hasContent()}>
            <CollapsibleBody>
              <NoteContent event={props.event} variant={props.variant} />
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
 * `replyTarget`/`quoteTargets` は `event-refs.ts` の純関数 —— 呼ぶだけでは
 * 何も取得しない。実際に取得を発行しうるのは、その結果を
 * `<EventView variant="compact">` へ渡した先だけ (`EventView` が store に
 * 無ければ `events.request` を呼ぶ)。
 *
 * 返信先は骨格の**外** (上に積む独立したブロック)、引用先は骨格の**中**
 * (本文列の下)。返信先は自分自身の骨格を持つ別イベントの `compact` 描画で
 * あり、スレッドの縦線で本体と繋がる。引用は本文に付属する参照なので
 * 本文の左端に揃える。
 */
export const NoteFull: Component<EventBodyProps> = (props) => {
  const reply = () => replyTarget(props.event);
  // `q` タグと、タグを付けずに本文へ貼られた `nostr:` の両方から集める。
  // **描くのはここだけ** —— 本文側 (`NoteContent` の mention) では描かない。
  // 引用は両方に現れるのが普通なので、双方で描くと同じイベントが二重に出る。
  const quotes = () => [
    ...quoteTargets(props.event),
    ...contentQuoteTargets(props.event),
  ];

  return (
    <article data-testid="note" class="pt-1 pr-2 pb-1 pl-1 text-body">
      {/*
        返信先の親イベントは本体の上に、**枠を持たずに**積む。枠は
        「別の投稿の引用」を意味し、返信先は「同じ会話の続き」なので、
        代わりにアイコンの下から伸びる縦線 (`threadLine`) で繋ぐ。
        親イベント本体がまだ届いていなくても `EventView` が「読み込み中」を
        出すので、ここは到着を待たない。誰への返信かは `replyTo` として
        本体側が `e` タグの 5 番目の要素 (NIP-10、spec 5 節) から即座に出す。
      */}
      <Show when={reply()}>
        {(ref) => (
          <EventView
            id={ref().id}
            variant="compact"
            relayHint={ref().relay}
            threadLine
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
          引用先。`q` タグが event-address (`form: "address"`) を指す場合は
          置換可能イベントの取得が範囲外 (spec 9 節) なので、`compact` の
          代わりに「未対応の参照です」を出す。
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
      </NoteBody>
    </article>
  );
};

/**
 * kind:1 の小型表示 (spec 6 節の表)。**`replyTarget`/`quoteTargets` を
 * 一切呼ばない** —— 呼ぶこと自体は無害 (純関数) だが、呼ばないと決めて
 * おくことで「関連イベントを一切要求しない」という compact の規則が
 * コードを読むだけで確認できる (この規則が壊れていないかは
 * `Note.test.tsx` がユニットテストで直接主張する)。
 *
 * **padding を持たない。** compact は常に何かの中 (引用カード・リポスト・
 * 返信先) に置かれる入れ子であり、置く側が既に余白を取る。ここで p-2 等を
 * 足すと、置く側の余白と足し合わさって二重になり、入れ子が深くなるほど
 * カラムの左端がガタつく。v0 は group セレクタ (`group-[_]/event:p-0`) で
 * 「入れ子なら 0 にする」という後付けの上書きをしていたが、ここでは
 * 最初から持たないほうがシンプル (spec 3 節、brief Step 2)。
 * **次の変更者へ**: ここに padding を足したくなったら、それは compact の
 * 責務ではなく置く側 (引用カード等) の責務。
 */
export const NoteCompact: Component<EventBodyProps> = (props) => (
  <article data-testid="note" class="text-caption">
    <NoteBody
      event={props.event}
      variant="compact"
      threadLine={props.threadLine}
    />
  </article>
);
