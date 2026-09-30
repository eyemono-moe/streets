import { columnForEvent } from "@streets/core/deck/open-event";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type EventRef, replyTarget } from "@streets/core/nostr/event-refs";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import { resolveRepostTarget } from "@streets/core/view/repost-target";
import {
  type Component,
  ErrorBoundary,
  type JSX,
  Match,
  type ParentComponent,
  Show,
  Switch,
} from "solid-js";
import ArticleCard from "../article/ArticleCard";
import EmojiSetCard from "../emoji/EmojiSetCard";
import FollowSetCard from "../lists/FollowSetCard";
import PollBlock from "../poll/PollBlock";
import ProfileRow from "../profile/ProfileRow";
import { useReadLayer } from "../read-layer";
import { AuthorStatusLine } from "../status/UserStatus";
import { reportError } from "../telemetry";
import { useDispatch } from "../ui-events";
import ActionBar from "./ActionBar";
import ActionNotice from "./ActionNotice";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import { ChannelCard, ChannelMessageCard } from "./ChannelEvents";
import { Frame, Notice } from "./EventFrame";
import EventMenu from "./EventMenu";
import { NoteContent } from "./NoteContent";
import ReactionList from "./ReactionList";
import { useEvent } from "./use-event";
import UserLink from "./UserLink";

/**
 * `compact` は関連イベント（引用・リポスト元）を取りにいかない。
 * 引用は compact で出すので、入れ子は 1 段で止まり、1 件の投稿が取得を連鎖させない。
 */
export type EventSize = "normal" | "compact";
export { NoteContent } from "./NoteContent";

/**
 * 本文を畳み始める高さ。compact は引用や高密度のカラムで並ぶので、
 * 1 件がカラムを占めないよう normal より低くする。
 */
type ContentProps = {
  event: NostrEvent;
  size: EventSize;
  /** 画像を展開するか。カラム設定で切ると、URL のリンクだけにする。 */
  expandMedia?: boolean;
  /** 会話が続く向きを、アイコンから伸びる線で示す。 */
  threadLine?: "above" | "below" | "both";
  /**
   * 長い投稿を読んでいる間も、アイコンを見えたままにする（スレッドのカラム）。
   * タイムラインは仮想リストで行の位置を `transform` で決めるため、ここで
   * 貼り付けるとアイコンだけが下へずれる。既定は貼り付けない。
   */
  stickyAvatar?: boolean;
  /** 本文の下に足すもの。書きかけのプレビューで、まだアップロードしていない画像を出す。 */
  media?: JSX.Element;
  /**
   * 返信のとき、その返信先を上に 1 件出す（スレッドと同じ、線でつないだ形）。
   * タイムラインのカラムで使う。スレッドのカラムは自分で祖先を並べるので要らない。
   */
  replyContext?: boolean;
};

/** アクション欄を出す投稿か。出さない投稿のメニューには、欄に入る操作を入れない。 */
type ActionsProps = { withActions?: boolean };

const Head: Component<ContentProps & ActionsProps> = (props) => {
  const date = () => new Date(props.event.created_at * 1000);

  return (
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-1.5">
      <AuthorNames pubkey={props.event.pubkey} size={props.size} />
      <time
        class="c-secondary text-caption"
        datetime={date().toISOString()}
        title={formatEventTimeFull(date())}
      >
        {formatEventTime(date(), new Date())}
      </time>
      {/* 引用の中（compact）には出さない。開いた先で操作する。 */}
      <Show when={props.size === "normal"}>
        <EventMenu event={props.event} withActions={props.withActions} />
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
const Row: ParentComponent<ContentProps & ActionsProps> = (props) => (
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
      <div classList={{ "sticky top-2": props.stickyAvatar }}>
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
      <Head
        event={props.event}
        size={props.size}
        withActions={props.withActions}
      />
      {/* 高密度（compact）では出さない。1 件の高さを揃えて詰めるための表示なので。 */}
      <Show when={props.size === "normal"}>
        <AuthorStatusLine pubkey={props.event.pubkey} />
      </Show>
      {props.children}
    </div>
  </div>
);

/** 取得中と見つからなかったを別の文言で出す。 */
const Lookup: Component<{
  target: EventRef;
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

const Note: Component<ContentProps> = (props) => {
  const replyTo = () => replyTarget(props.event);

  return (
    <Row
      event={props.event}
      size={props.size}
      threadLine={props.threadLine}
      withActions
    >
      <Show when={replyTo()?.pubkey}>
        {(pubkey) => (
          <p class="c-secondary flex min-w-0 gap-1 text-caption">
            <span class="shrink-0">返信先</span>
            <UserLink pubkey={pubkey()} class="min-w-0 truncate" />
          </p>
        )}
      </Show>
      <NoteContent
        event={props.event}
        size={props.size}
        expandMedia={props.expandMedia}
        media={props.media}
      />
      {/* 引用やダイアログの中の compact は読むためのもので、そこから操作させない。 */}
      <Show when={props.size === "normal"}>
        <ReactionList event={props.event} />
        <ActionBar event={props.event} />
      </Show>
    </Row>
  );
};

const Repost: Component<ContentProps> = (props) => {
  const { store } = useReadLayer();
  return (
    <>
      <p class="c-secondary flex min-w-0 items-center gap-1.5 text-caption">
        <span class="i-material-symbols:repeat-rounded size-3.5 shrink-0" />
        <UserLink pubkey={props.event.pubkey} class="min-w-0 truncate" />
        <span class="shrink-0">がリポスト</span>
      </p>
      <Show when={props.size === "normal"}>
        <Show
          when={resolveRepostTarget(props.event, store)}
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
};

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
        stickyAvatar={props.stickyAvatar}
        media={props.media}
      />
    </Match>
    <Match when={props.event.kind === 6 || props.event.kind === 16}>
      <Repost event={props.event} size={props.size} />
    </Match>
    {/* リストは押すとメンバーのタイムラインを開く（開き先は columnForEvent）。 */}
    <Match when={props.event.kind === 30000}>
      <Row event={props.event} size={props.size} threadLine={props.threadLine}>
        <FollowSetCard event={props.event} size={props.size} />
      </Row>
    </Match>
    <Match when={props.event.kind === 30030}>
      <Row event={props.event} size={props.size} threadLine={props.threadLine}>
        <EmojiSetCard event={props.event} size={props.size} />
      </Row>
    </Match>
    {/* 投票（NIP-88）。問いは本文と同じ描き方にする（絵文字やリンクが入りうる）。 */}
    <Match when={props.event.kind === 1068}>
      <Row event={props.event} size={props.size} threadLine={props.threadLine}>
        <NoteContent
          event={props.event}
          size={props.size}
          expandMedia={props.expandMedia}
        />
        <PollBlock event={props.event} size={props.size} />
      </Row>
    </Match>
    <Match when={props.event.kind === 30023}>
      <Row event={props.event} size={props.size} threadLine={props.threadLine}>
        <ArticleCard event={props.event} size={props.size} />
        <Show when={props.size === "normal"}>
          <ReactionList event={props.event} />
        </Show>
      </Row>
    </Match>
  </Switch>
);

/** これ以上動いたら「押した」ではなく「文字を選んだ」とみなす。 */
const DRAG_SLOP = 4;

// label を含めるのは、投票の選択肢の文字を押したときに投稿まで開かないため。
const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    "a, button, input, textarea, label, select, [role='button']",
  ) !== null;

/** 手元にあるイベントを 1 件描く。押すと、そのスレッドを開くよう上へ伝える。 */
const EventBody: Component<ContentProps> = (props) => {
  const dispatch = useDispatch();
  let downAt: { x: number; y: number } | undefined;

  /**
   * 上に出す返信先。テキストノートで、normal のときだけ。compact は関連
   * イベントを取りにいかない決まりなので、返信の返信で連鎖してしまう。
   */
  const parent = () => {
    if (!props.replyContext || props.size !== "normal") return undefined;
    if (props.event.kind !== 1) return undefined;
    const ref = replyTarget(props.event);
    return ref?.form === "id" ? ref : undefined;
  };

  return (
    <Switch
      fallback={
        <StandardEvent
          {...props}
          parent={parent}
          onDown={(event) => {
            downAt = { x: event.clientX, y: event.clientY };
          }}
          onOpen={(event) => {
            if (isInteractive(event.target)) return;
            if (document.getSelection()?.isCollapsed === false) return;
            const moved =
              downAt !== undefined &&
              (Math.abs(event.clientX - downAt.x) > DRAG_SLOP ||
                Math.abs(event.clientY - downAt.y) > DRAG_SLOP);
            if (moved) return;
            dispatch({
              type: "stack/open",
              column: columnForEvent(props.event),
            });
          }}
        />
      }
    >
      {/* プロフィールは人そのものなので、フォロー一覧と同じ行で描く。 */}
      <Match when={props.event.kind === 0}>
        <ProfileRow pubkey={props.event.pubkey} />
      </Match>
      {/* チャンネル（NIP-28）は、チャンネルとして見せて開けるようにする。 */}
      <Match when={props.event.kind === 40 || props.event.kind === 41}>
        <ChannelCard event={props.event} size={props.size} />
      </Match>
      <Match when={props.event.kind === 42}>
        <ChannelMessageCard
          event={props.event}
          size={props.size}
          expandMedia={props.expandMedia}
        />
      </Match>
      {/* リアクションは通知と同じ形で描く。 */}
      <Match when={props.event.kind === 7}>
        <ActionNotice
          events={[props.event]}
          size={props.size}
          expandMedia={props.expandMedia}
        />
      </Match>
    </Switch>
  );
};

const StandardEvent: Component<
  ContentProps & {
    parent: () => Extract<EventRef, { form: "id" }> | undefined;
    onDown: (event: MouseEvent) => void;
    onOpen: (event: MouseEvent) => void;
  }
> = (props) => (
  <>
    {/* 返信先は線でつないで上に置く。スレッドのカラムと同じ並べ方。 */}
    <Show when={props.parent()}>
      {(ref) => (
        <EventRefView
          target={ref()}
          size="compact"
          expandMedia={props.expandMedia}
          threadLine="below"
        />
      )}
    </Show>
    <Frame size={props.size} onOpen={props.onOpen} onDown={props.onDown}>
      <EventContent
        event={props.event}
        size={props.size}
        expandMedia={props.expandMedia}
        threadLine={props.parent() ? "above" : props.threadLine}
        stickyAvatar={props.stickyAvatar}
        media={props.media}
      />
    </Frame>
  </>
);

/** id か住所しか分からないイベントを取りにいって描く。 */
export const EventRefView: Component<{
  target: EventRef;
  size: EventSize;
  expandMedia?: boolean;
  threadLine?: "above" | "below" | "both";
}> = (props) => (
  <Lookup
    target={props.target}
    missing="読み込めませんでした"
    noticeClass="p-2.5"
  >
    {/* 中身は `Event` に渡す。引用カードを押したときに、外側ではなく引用元が起点になる。 */}
    {(event) => (
      <Event
        event={event}
        size={props.size}
        expandMedia={props.expandMedia}
        threadLine={props.threadLine}
      />
    )}
  </Lookup>
);

/**
 * 描けなかった投稿の代わり。リレーから来るイベントは形を保証されないので、1 件が
 * 描画の途中で投げても、カラムごと落とさずにその 1 件だけをこれに置き換える。
 */
export const BrokenEvent: Component<{ id?: string; kind?: number }> = (
  props,
) => (
  <div class="c-secondary flex items-center gap-2 bg-primary p-3 text-caption">
    <span
      class="i-material-symbols:error-outline-rounded size-4 shrink-0"
      aria-hidden="true"
    />
    <span class="min-w-0">
      この投稿を表示できませんでした
      <Show when={props.kind !== undefined}>（kind:{props.kind}）</Show>
    </span>
  </div>
);

/** 投稿 1 件。描けなかったときは `BrokenEvent` に置き換える。 */
const Event: Component<ContentProps> = (props) => (
  <ErrorBoundary
    fallback={(error) => {
      console.error("投稿を描けませんでした", props.event?.id, error);
      reportError(error, "event-render");
      return <BrokenEvent id={props.event?.id} kind={props.event?.kind} />;
    }}
  >
    <EventBody {...props} />
  </ErrorBoundary>
);

export default Event;
