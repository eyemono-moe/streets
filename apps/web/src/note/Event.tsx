import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type EventRef,
  replyTarget,
  repostTarget,
} from "@streets/core/nostr/event-refs";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { layoutNote } from "@streets/core/view/note-layout";
import {
  type Component,
  For,
  type JSX,
  Match,
  type ParentComponent,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useDispatch } from "../ui-events";
import ActionBar from "./ActionBar";
import ActionNotice from "./ActionNotice";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import EventMenu from "./EventMenu";
import NoteText from "./NoteText";
import ReactionList from "./ReactionList";
import UserLink from "./UserLink";
import { useEvent } from "./use-event";

/**
 * `compact` は関連イベント（引用・リポスト元）を取りにいかない。
 * 引用は compact で出すので、入れ子は 1 段で止まり、1 件の投稿が取得を連鎖させない。
 */
export type EventSize = "normal" | "compact";

type ContentProps = {
  event: NostrEvent;
  size: EventSize;
  /** 画像を展開するか。カラム設定で切ると、URL のリンクだけにする。 */
  expandMedia?: boolean;
  /** 会話が続く向きを、アイコンから伸びる線で示す。 */
  threadLine?: "above" | "below" | "both";
};

const Notice: Component<{ children: JSX.Element }> = (props) => (
  <p class="c-secondary text-caption">{props.children}</p>
);

const Head: Component<ContentProps> = (props) => {
  const date = () => new Date(props.event.created_at * 1000);

  return (
    <div class="flex items-end gap-1.5">
      <AuthorNames pubkey={props.event.pubkey} size={props.size} />
      <time
        class="c-secondary shrink-0 text-caption"
        datetime={date().toISOString()}
        title={formatEventTimeFull(date())}
      >
        {formatEventTime(date(), new Date())}
      </time>
      {/* 引用の中（compact）には出さない。開いた先で操作する。 */}
      <Show when={props.size === "normal"}>
        <EventMenu event={props.event} />
      </Show>
    </div>
  );
};

/**
 * 縦線の横位置。compact のアイコン中心（枠の左から 24px）に揃える。
 * normal と compact が混ざるスレッドで、アイコンの中央に置くと段ごとにずれて繋がらない。
 * 枠の内側の余白が size で違うぶん、ここで打ち消す。
 */
const lineX = (size: EventSize) => ({
  "left-3": size === "normal",
  "left-4": size === "compact",
});

/** アイコン列と本文列。どの kind も同じ骨格に載せる。 */
const Row: ParentComponent<ContentProps> = (props) => (
  <div
    class="flex items-start"
    classList={{
      "gap-3": props.size === "normal",
      "gap-2": props.size === "compact",
    }}
  >
    {/* アイコン列。線は絶対配置にして、アイコンは上に揃えたまま上下へ伸ばす。 */}
    <div class="relative flex shrink-0 flex-col self-stretch">
      <Show when={props.threadLine === "above" || props.threadLine === "both"}>
        {/* 上へはみ出して、投稿の間の隙間を跨ぐ。 */}
        <div
          class="-top-3 -translate-x-1/2 absolute h-3 w-0.5 bg-tertiary"
          classList={lineX(props.size)}
        />
      </Show>
      <Show when={props.threadLine === "below" || props.threadLine === "both"}>
        <div
          class="-bottom-3 -translate-x-1/2 absolute w-0.5 bg-tertiary"
          classList={{
            ...lineX(props.size),
            "top-11": props.size === "normal",
            "top-9": props.size === "compact",
          }}
        />
      </Show>
      {/*
        長い投稿でも、読んでいる間アイコンが見えているようにする。
        縦線より後ろに置くので、z-index 無しで線の上に乗る。
      */}
      <div classList={{ "sticky top-2": props.threadLine !== undefined }}>
        <Avatar pubkey={props.event.pubkey} size={props.size} />
      </div>
    </div>
    <div
      class="flex min-w-0 flex-1 flex-col"
      classList={{
        "gap-2": props.size === "normal",
        "gap-1.5": props.size === "compact",
      }}
    >
      <Head event={props.event} size={props.size} />
      {props.children}
    </div>
  </div>
);

const MediaImage: Component<{ url: string; size: EventSize }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show
      when={!broken()}
      fallback={
        <a
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
          class="break-all text-caption text-link"
        >
          {props.url}
        </a>
      }
    >
      <a
        href={props.url}
        target="_blank"
        rel="noopener noreferrer"
        class="block w-full"
      >
        <img
          src={props.url}
          alt=""
          loading="lazy"
          class="block w-full rounded-2 bg-secondary object-cover"
          classList={{
            "h-45": props.size === "normal",
            "h-30": props.size === "compact",
          }}
          onError={() => setBroken(true)}
        />
      </a>
    </Show>
  );
};

/** 取得中と見つからなかったを別の文言で出す。 */
const Lookup: Component<{
  target: { id: string; relay?: RelayUrl };
  missing: string;
  /** 取得中・不在の 1 行に付ける余白。枠の中に置くときに要る。 */
  noticeClass?: string;
  children: (event: NostrEvent) => JSX.Element;
}> = (props) => {
  const lookup = useEvent(() => props.target);
  return (
    <Switch>
      <Match
        when={(() => {
          const current = lookup();
          return current.phase === "found" && current.event;
        })()}
      >
        {(event) => props.children(event())}
      </Match>
      <Match when={lookup().phase === "missing"}>
        <div class={props.noticeClass}>
          <Notice>{props.missing}</Notice>
        </div>
      </Match>
      <Match when={true}>
        <div class={props.noticeClass}>
          <Notice>読み込み中…</Notice>
        </div>
      </Match>
    </Switch>
  );
};

const Frame: ParentComponent<{
  size: EventSize;
  onOpen?: (event: MouseEvent) => void;
  onDown?: (event: MouseEvent) => void;
}> = (props) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
  <article
    class="flex flex-col bg-primary"
    classList={{
      "cursor-pointer": props.onOpen !== undefined,
    }}
    onMouseDown={(event) => props.onDown?.(event)}
    onClick={(event) => {
      // 押された場所に一番近い投稿が自分のときだけ開く。引用の中を押したら
      // 引用元が起点になる。Solid は click を委譲するので stopPropagation では止まらない。
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("article") !== event.currentTarget
      ) {
        return;
      }
      props.onOpen?.(event);
    }}
  >
    {/*
      画面の外を飛ばすのは中身だけ。`article` そのものに当てると、下線が端数の
      位置で丸められて消えることがある（区切りが 2、3 本に 1 本抜ける）。
    */}
    <div
      class="offscreen-skip flex flex-col"
      classList={{
        "gap-2 p-3": props.size === "normal",
        "gap-1.5 p-2": props.size === "compact",
      }}
    >
      {props.children}
    </div>
  </article>
);

const Quote: Component<{ quote: EventRef }> = (props) => (
  <div class="w-full overflow-hidden rounded-2 border border-primary">
    <Show
      when={props.quote.form === "id" && props.quote}
      fallback={
        <Frame size="compact">
          <Notice>未対応の参照です</Notice>
        </Frame>
      }
    >
      {(ref) => <EventRefView target={ref()} size="compact" />}
    </Show>
  </div>
);

const Note: Component<ContentProps> = (props) => {
  const layout = createMemo(() =>
    layoutNote(props.event, { quotes: props.size === "normal" }),
  );
  const replyTo = () => replyTarget(props.event)?.pubkey;

  return (
    <Row event={props.event} size={props.size} threadLine={props.threadLine}>
      <Show when={replyTo()}>
        {(pubkey) => (
          <p class="c-secondary flex min-w-0 gap-1 text-caption">
            <span class="shrink-0">返信先</span>
            <UserLink pubkey={pubkey()} class="min-w-0 truncate" />
          </p>
        )}
      </Show>
      <Show when={layout().text.length > 0}>
        <NoteText
          tokens={layout().text}
          class="c-primary"
          classList={{
            "text-body": props.size === "normal",
            "text-[14px]": props.size === "compact",
          }}
        />
      </Show>
      <For each={layout().images}>
        {(url) => (
          <Show
            when={props.expandMedia !== false}
            fallback={
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-caption text-link"
              >
                {url}
              </a>
            }
          >
            <MediaImage url={url} size={props.size} />
          </Show>
        )}
      </For>
      <For each={layout().quotes}>{(quote) => <Quote quote={quote} />}</For>
      {/* 引用やダイアログの中の compact は読むためのもので、そこから操作させない。 */}
      <Show when={props.size === "normal"}>
        <ReactionList event={props.event} />
        <ActionBar event={props.event} />
      </Show>
    </Row>
  );
};

const Repost: Component<ContentProps> = (props) => (
  <>
    <p class="c-secondary flex min-w-0 items-center gap-1.5 text-caption">
      <span class="i-material-symbols:repeat-rounded size-3.5 shrink-0" />
      <UserLink pubkey={props.event.pubkey} class="min-w-0 truncate" />
      <span class="shrink-0">がリポスト</span>
    </p>
    <Show when={props.size === "normal"}>
      <Show
        when={repostTarget(props.event)}
        fallback={<Notice>リポスト元が指定されていません</Notice>}
      >
        {(ref) => (
          <Lookup target={ref()} missing="リポスト元を読み込めませんでした">
            {(event) => (
              <EventContent
                event={event}
                size={props.size}
                expandMedia={props.expandMedia}
              />
            )}
          </Lookup>
        )}
      </Show>
    </Show>
  </>
);

const Unsupported: Component<ContentProps> = (props) => (
  <Row event={props.event} size={props.size}>
    <Notice>未対応のイベントです（kind:{props.event.kind}）</Notice>
  </Row>
);

const EventContent: Component<ContentProps> = (props) => (
  <Switch fallback={<Unsupported event={props.event} size={props.size} />}>
    <Match when={props.event.kind === 1}>
      <Note
        event={props.event}
        size={props.size}
        expandMedia={props.expandMedia}
        threadLine={props.threadLine}
      />
    </Match>
    <Match when={props.event.kind === 6 || props.event.kind === 16}>
      <Repost event={props.event} size={props.size} />
    </Match>
  </Switch>
);

/** これ以上動いたら「押した」ではなく「文字を選んだ」とみなす。 */
const DRAG_SLOP = 4;

const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("a, button, input, textarea, [role='button']") !== null;

/** 手元にあるイベントを 1 件描く。押すと、そのスレッドを開くよう上へ伝える。 */
const Event: Component<ContentProps> = (props) => {
  const dispatch = useDispatch();
  let downAt: { x: number; y: number } | undefined;

  // リアクションは「誰が何をしたか」が主役なので、通知と同じ形で描く。
  if (props.event.kind === 7) {
    return (
      <ActionNotice
        events={[props.event]}
        size={props.size}
        expandMedia={props.expandMedia}
      />
    );
  }

  return (
    <Frame
      size={props.size}
      // 引用（compact）も押して開ける。引用元をその場で読めないと、引用の意味が追えない。
      onOpen={(event) => {
        if (isInteractive(event.target)) return;
        const moved =
          downAt !== undefined &&
          (Math.abs(event.clientX - downAt.x) > DRAG_SLOP ||
            Math.abs(event.clientY - downAt.y) > DRAG_SLOP);
        if (moved) return;
        dispatch({
          type: "stack/open",
          column: buildThreadColumn(props.event.id),
        });
      }}
      onDown={(event) => {
        downAt = { x: event.clientX, y: event.clientY };
      }}
    >
      <EventContent
        event={props.event}
        size={props.size}
        expandMedia={props.expandMedia}
        threadLine={props.threadLine}
      />
    </Frame>
  );
};

/** id しか分からないイベントを取りにいって描く。 */
export const EventRefView: Component<{
  target: { id: string; relay?: RelayUrl };
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => (
  <Lookup
    target={props.target}
    missing="読み込めませんでした"
    noticeClass="p-2.5"
  >
    {/* 中身は `Event` に渡す。引用カードを押したときに、外側ではなく引用元が起点になる。 */}
    {(event) => (
      <Event event={event} size={props.size} expandMedia={props.expandMedia} />
    )}
  </Lookup>
);

export default Event;
