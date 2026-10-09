import { columnForEvent } from "@streets/core/deck/open-event";
import type { NostrEvent } from "@streets/core/nostr/event";
import { COMMENT_KIND, type EventRef } from "@streets/core/nostr/event-refs";
import { mediaPostTitle } from "@streets/core/nostr/media-post";
import {
  type CommentScope,
  commentScope,
  replyParentRef,
  replyPubkey,
} from "@streets/core/view/comment-scope";
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
import { Dynamic } from "solid-js/web";
import ArticleCard from "../article/ArticleCard";
import EmojiSetCard from "../emoji/EmojiSetCard";
import FollowSetCard from "../lists/FollowSetCard";
import ListSetCard from "../lists/ListSetCard";
import PollBlock from "../poll/PollBlock";
import ProfileRow from "../profile/ProfileRow";
import { useReadLayer } from "../read-layer";
import { UserStatusBadge } from "../status/UserStatusView";
import { reportError } from "../telemetry";
import { useDispatch } from "../ui-events";
import ActionBar from "./ActionBar";
import ActionNotice from "./ActionNotice";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import { ChannelCard, ChannelMessageCard } from "./ChannelEvents";
import { isRenderedKind, type RenderedKind } from "./event-kinds";
import { Frame, Notice } from "./EventFrame";
import EventStamp from "./EventStamp";
import MutedGate from "./MutedGate";
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
  /**
   * 長い本文を畳まず全文を出す。スレッドで開いた投稿は、長いから開いたのかもしれない
   * ので、もう一度「続きを読む」を押させない。書きかけのプレビューも全文を見たい。
   */
  fullBody?: boolean;
  /** 本文の下に足すもの。書きかけのプレビューで、まだアップロードしていない画像を出す。 */
  media?: JSX.Element;
  /**
   * 返信のとき、その返信先を上に 1 件出す（スレッドと同じ、線でつないだ形）。
   * タイムラインのカラムで使う。スレッドのカラムは自分で祖先を並べるので要らない。
   */
  replyContext?: boolean;
  /**
   * コメントが付いた先（記事など）の中で並べているか。そのときは、何へのコメントかを
   * 書かない —— 全部の行に同じことが出るだけになる。
   */
  withinScope?: boolean;
};

/** アクション欄を出す投稿か。出さない投稿のメニューには、欄に入る操作を入れない。 */
type ActionsProps = { withActions?: boolean };

const Head: Component<ContentProps & ActionsProps> = (props) => (
  <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-1.5">
    <AuthorNames pubkey={props.event.pubkey} size={props.size} />
    <EventStamp
      event={props.event}
      size={props.size}
      withActions={props.withActions}
    />
  </div>
);

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
      <div
        classList={{
          "sticky top-2": props.stickyAvatar,
          relative: !props.stickyAvatar,
        }}
      >
        <Avatar pubkey={props.event.pubkey} size={props.size} />
        {/* 高密度では、アイコンが小さく行も詰まるので印を出さない。 */}
        <Show when={props.size === "normal"}>
          <UserStatusBadge pubkey={props.event.pubkey} />
        </Show>
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

/**
 * 投稿のスレッドの外（記事・Web ページなど）へのコメントが、何について書かれたか。
 * 外部の識別子は長い URL になりやすいので、名前の後ろに並べず次の行に出す。
 */
const CommentScopeLines: Component<{ scope: CommentScope }> = (props) => (
  <>
    <p class="c-secondary flex min-w-0 items-center gap-1 text-caption">
      <span
        class="i-material-symbols:mode-comment-outline-rounded size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>{props.scope.label}</span>
    </p>
    <Show when={props.scope.type === "external" && props.scope} keyed>
      {(scope) => (
        <Show
          when={scope.url}
          fallback={
            <p class="c-secondary min-w-0 truncate text-caption">
              {scope.value}
            </p>
          }
        >
          {(url) => (
            <a
              href={url()}
              target="_blank"
              rel="noopener noreferrer"
              class="c-secondary min-w-0 truncate text-caption underline"
            >
              {scope.value}
            </a>
          )}
        </Show>
      )}
    </Show>
  </>
);

const Note: Component<ContentProps> = (props) => {
  const scope = () =>
    props.withinScope ? undefined : commentScope(props.event);
  const replyTo = () => replyPubkey(props.event);

  return (
    <Row
      event={props.event}
      size={props.size}
      threadLine={props.threadLine}
      withActions
    >
      {/* 何へのコメントかと返信先は、本文の上の 1 つの塊にする。 */}
      <Show when={scope() || replyTo()}>
        <div class="flex min-w-0 flex-col gap-0.5">
          <Show when={scope()}>
            {(current) => <CommentScopeLines scope={current()} />}
          </Show>
          <Show when={replyTo()}>
            {(pubkey) => (
              <p class="c-secondary flex min-w-0 gap-1 text-caption">
                <span class="shrink-0">返信先</span>
                <UserLink pubkey={pubkey()} class="min-w-0 truncate" />
              </p>
            )}
          </Show>
        </div>
      </Show>
      {/* 画像・動画の投稿は題名を持てる。本文は説明なので、題名を上に置く。 */}
      <Show when={mediaPostTitle(props.event)}>
        {(title) => (
          <p
            class="c-primary break-words font-bold"
            classList={{
              "text-body": props.size === "normal",
              "text-[14px]": props.size === "compact",
            }}
          >
            {title()}
          </p>
        )}
      </Show>
      <NoteContent
        event={props.event}
        size={props.size}
        expandMedia={props.expandMedia}
        longBody={props.fullBody ? "full" : undefined}
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
    </>
  );
};

const Unsupported: Component<ContentProps> = (props) => (
  <Row event={props.event} size={props.size}>
    <Notice>未対応のイベントです（kind:{props.event.kind}）</Notice>
  </Row>
);

/** 問いは本文と同じ描き方にする（絵文字やリンクが入りうる）。 */
const Poll: Component<ContentProps> = (props) => (
  <Row event={props.event} size={props.size} threadLine={props.threadLine}>
    <NoteContent
      event={props.event}
      size={props.size}
      expandMedia={props.expandMedia}
      longBody={props.fullBody ? "full" : undefined}
    />
    <PollBlock event={props.event} size={props.size} />
  </Row>
);

const Article: Component<ContentProps> = (props) => (
  <Row event={props.event} size={props.size} threadLine={props.threadLine}>
    <ArticleCard event={props.event} size={props.size} />
    <Show when={props.size === "normal"}>
      <ReactionList event={props.event} />
    </Show>
  </Row>
);

/** プロフィールは人そのものなので、フォロー一覧と同じ行で描く。 */
const Profile: Component<ContentProps> = (props) => (
  <ProfileRow pubkey={props.event.pubkey} />
);

/** リアクションは通知と同じ形で描く。 */
const Reaction: Component<ContentProps> = (props) => (
  <ActionNotice
    events={[props.event]}
    size={props.size}
    expandMedia={props.expandMedia}
  />
);

/**
 * `framed` は枠（押すとスレッドを開く・返信先を上に出す）の中で、`Row` に載せて描く。
 * リポストの中身もこちらで描く。`standalone` は枠ごと自分で描く。
 */
type EventView = {
  layout: "framed" | "standalone";
  View: Component<ContentProps>;
};

const EVENT_VIEWS: { [K in RenderedKind]: EventView } = {
  0: { layout: "standalone", View: Profile },
  // 画像・動画の投稿（NIP-68・NIP-71）は、imeta の画像を添えた投稿と同じ形で描く。
  1: { layout: "framed", View: Note },
  20: { layout: "framed", View: Note },
  21: { layout: "framed", View: Note },
  22: { layout: "framed", View: Note },
  1111: { layout: "framed", View: Note },
  6: { layout: "framed", View: Repost },
  16: { layout: "framed", View: Repost },
  7: { layout: "standalone", View: Reaction },
  // チャンネル（NIP-28）は、チャンネルとして見せて開けるようにする。
  40: { layout: "standalone", View: ChannelCard },
  41: { layout: "standalone", View: ChannelCard },
  42: { layout: "standalone", View: ChannelMessageCard },
  1068: { layout: "framed", View: Poll },
  // リストは押すとメンバーのタイムラインを開く（開き先は columnForEvent）。
  30000: { layout: "framed", View: FollowSetCard },
  30023: { layout: "framed", View: Article },
  30030: { layout: "framed", View: EmojiSetCard },
  30002: { layout: "framed", View: ListSetCard },
  30003: { layout: "framed", View: ListSetCard },
  30004: { layout: "framed", View: ListSetCard },
  30005: { layout: "framed", View: ListSetCard },
  30006: { layout: "framed", View: ListSetCard },
  30015: { layout: "framed", View: ListSetCard },
  39089: { layout: "framed", View: ListSetCard },
  39092: { layout: "framed", View: ListSetCard },
};

const viewFor = (kind: number, layout: EventView["layout"]) => {
  if (!isRenderedKind(kind)) return undefined;
  const view = EVENT_VIEWS[kind];
  return view.layout === layout ? view.View : undefined;
};

const EventContent: Component<ContentProps> = (props) => (
  <Show
    when={viewFor(props.event.kind, "framed")}
    fallback={<Unsupported {...props} />}
  >
    {(View) => <Dynamic component={View()} {...props} />}
  </Show>
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
    if (props.event.kind !== 1 && props.event.kind !== COMMENT_KIND) {
      return undefined;
    }
    return replyParentRef(props.event);
  };

  return (
    <Show
      when={viewFor(props.event.kind, "standalone")}
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
              from: props.event.id,
            });
          }}
        />
      }
    >
      {(View) => <Dynamic component={View()} {...props} />}
    </Show>
  );
};

const StandardEvent: Component<
  ContentProps & {
    parent: () => EventRef | undefined;
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
          gateMuted
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
        withinScope={props.withinScope}
        fullBody={props.fullBody}
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
  /**
   * ミュートの対象なら押すまで 1 行に畳む。返信先や引用のように、別の投稿に
   * 添えて出すときに使う。通知やスレッドのように、その投稿自体を見にきた所では畳まない。
   */
  gateMuted?: boolean;
}> = (props) => (
  <Lookup
    target={props.target}
    missing="読み込めませんでした"
    noticeClass="p-2.5"
  >
    {/* 中身は `Event` に渡す。引用カードを押したときに、外側ではなく引用元が起点になる。 */}
    {(event) => (
      <MutedGate event={event} active={props.gateMuted === true}>
        <Event
          event={event}
          size={props.size}
          expandMedia={props.expandMedia}
          threadLine={props.threadLine}
        />
      </MutedGate>
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
