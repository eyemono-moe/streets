import { createElementSize } from "@solid-primitives/resize-observer";
import { For, Show, createSignal } from "solid-js";
import type { Component, ParentComponent } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import { quoteTargets, replyTarget } from "../../../core/nostr/event-refs";
import {
  formatEventTime,
  formatEventTimeFull,
} from "../../../core/view/format-time";
import { useRender } from "../../../core/view/render-context";
import type { EventVariant } from "../../../core/view/renderer-registry";
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
 * フォント・折返し・絵文字の連続で簡単にずれるので、
 * `@solid-primitives/resize-observer`（v0 も使用、既存の依存）で
 * **実際にレンダリングされた高さ**を測る。`compact` でも同じ仕組みを通す
 * (v0 は `small` でも `EventBase` を通る)。
 */
const CollapsibleBody: ParentComponent = (props) => {
  const [wrapper, setWrapper] = createSignal<HTMLDivElement>();
  const size = createElementSize(wrapper);
  const [expanded, setExpanded] = createSignal(false);
  const isOverflown = () => (size.height ?? 0) >= MAX_CONTENT_HEIGHT;

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
          class="absolute bottom-0 flex w-full cursor-s-resize appearance-none justify-center bg-gradient-to-b from-transparent to-white pt-4 text-caption dark:to-ui-950"
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
 * 骨格そのもの (spec 3 節): `avatar`/`name`/`content` の 2 列グリッド。
 * `full`/`compact` の共通部分 —— 旧 `Note.tsx` が持っていた「著者・本文・
 * 時刻」の 3 要素を、v0 の `EventBase` と同じ配置に組み直したもの
 * (e2e が拾う `note-author`/`note-content`/`note-created-at` は変えない)。
 *
 * `content` グリッド領域は「本文が空なら器ごと出さない」(design 6 節) ——
 * 空文字列だけでなく空白だけの本文も「無い」として扱う。visually empty な
 * 本文の下に折り畳みの器や余白だけが残るのを避けるため。
 */
const NoteBody: Component<{ event: NostrEvent; variant: EventVariant }> = (
  props,
) => {
  const ctx = useRender();
  const hasContent = () => props.event.content.trim().length > 0;
  const created = () => new Date(props.event.created_at * 1000);

  return (
    <>
      <div class="grid-area-[avatar]">
        <Avatar pubkey={props.event.pubkey} size={props.variant} />
      </div>
      <div class="grid-area-[name] flex items-baseline gap-1 overflow-hidden">
        <p data-testid="note-author" class="w-fit max-w-full truncate">
          <Profile
            pubkey={props.event.pubkey}
            store={ctx.store}
            requests={ctx.profiles}
            variant="author"
          />
        </p>
        <span
          data-testid="note-created-at"
          class="c-secondary text-nowrap text-caption"
          title={formatEventTimeFull(created())}
        >
          {formatEventTime(created(), new Date())}
        </span>
      </div>
      <div class="grid-area-[content] flex flex-col gap-1">
        <Show when={hasContent()}>
          <CollapsibleBody>
            <NoteContent event={props.event} variant={props.variant} />
          </CollapsibleBody>
        </Show>
      </div>
    </>
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
 * 返信先・引用先は `avatar`/`name`/`content` の 2 列グリッドの**外**に置く
 * (grid の上下に並ぶ独立したブロック) —— グリッドは「このイベント 1 件」の
 * 骨格 (spec 3 節) であり、返信先・引用先はそれぞれが自分自身の骨格を持つ
 * 別イベントの `compact` 描画だから。
 */
export const NoteFull: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  const reply = () => replyTarget(props.event);
  const quotes = () => quoteTargets(props.event);

  return (
    <article data-testid="note" class="space-y-1 p-2 text-body">
      {/*
        返信先は本文の上。`ref.pubkey` があれば `<Profile>` を即座に出す ——
        親イベント (返信元) の到着を待たない。NIP-10 の `e` タグは 5 番目の
        要素に参照先の pubkey を運ぶことがあり (spec 5 節)、それが「取得前に
        著者名を出せる」の実装そのもの。`<EventView variant="compact">` は
        pubkey の有無に関わらず常に続けて描く (親イベント本体はまだ届いて
        いないかもしれない)。
      */}
      <Show when={reply()}>
        {(ref) => (
          <div class="space-y-1">
            <Show when={ref().pubkey}>
              {(pubkey) => (
                <p data-testid="reply-to" class="c-secondary text-caption">
                  <Profile
                    pubkey={pubkey()}
                    store={ctx.store}
                    requests={ctx.profiles}
                  />
                  への返信
                </p>
              )}
            </Show>
            <NestedEventCard>
              <EventView
                id={ref().id}
                variant="compact"
                relayHint={ref().relay}
              />
            </NestedEventCard>
          </div>
        )}
      </Show>

      <div
        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
        style={{
          "grid-template-areas": `
            "avatar name"
            "avatar content"
            `,
        }}
      >
        <NoteBody event={props.event} variant="full" />
      </div>

      {/*
        引用先は本文の下。`q` タグが event-address (`form: "address"`) を
        指す場合は置換可能イベントの取得が範囲外 (spec 9 節) なので、
        `compact` の代わりに「未対応の参照です」を出す。
      */}
      <For each={quotes()}>
        {(ref) =>
          ref.form === "id" ? (
            <NestedEventCard>
              <EventView id={ref.id} variant="compact" relayHint={ref.relay} />
            </NestedEventCard>
          ) : (
            <p data-testid="unsupported-ref" class="c-secondary text-caption">
              未対応の参照です
            </p>
          )
        }
      </For>
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
export const NoteCompact: Component<{ event: NostrEvent }> = (props) => (
  <article data-testid="note" class="space-y-1 text-caption">
    <div
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1"
      style={{
        "grid-template-areas": `
          "avatar name"
          "avatar content"
          `,
      }}
    >
      <NoteBody event={props.event} variant="compact" />
    </div>
  </article>
);
