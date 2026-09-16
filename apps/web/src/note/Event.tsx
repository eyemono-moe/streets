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
import ActionBar from "./ActionBar";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import Name from "./Name";
import NoteText from "./NoteText";
import ReactionList from "./ReactionList";
import { useEvent } from "./use-event";

/**
 * `compact` は関連イベント（引用・リポスト元）を取りにいかない。
 * 引用は compact で出すので、入れ子は 1 段で止まり、1 件の投稿が取得を連鎖させない。
 */
export type EventSize = "normal" | "compact";

type ContentProps = { event: NostrEvent; size: EventSize };

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
    </div>
  );
};

/** アイコン列と本文列。どの kind も同じ骨格に載せる。 */
const Row: ParentComponent<ContentProps> = (props) => (
  <div
    class="flex items-start"
    classList={{
      "gap-3": props.size === "normal",
      "gap-2": props.size === "compact",
    }}
  >
    <Avatar pubkey={props.event.pubkey} size={props.size} />
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
        <Notice>{props.missing}</Notice>
      </Match>
      <Match when={true}>
        <Notice>読み込み中…</Notice>
      </Match>
    </Switch>
  );
};

const Frame: ParentComponent<{ size: EventSize }> = (props) => (
  <article
    class="flex flex-col bg-primary"
    classList={{
      "gap-2 p-3": props.size === "normal",
      "gap-1.5 p-2": props.size === "compact",
    }}
  >
    {props.children}
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
    <Row event={props.event} size={props.size}>
      <Show when={replyTo()}>
        {(pubkey) => (
          <p class="c-secondary flex min-w-0 gap-1 text-caption">
            <span class="shrink-0">返信先</span>
            <span class="truncate">
              <Name pubkey={pubkey()} />
            </span>
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
        {(url) => <MediaImage url={url} size={props.size} />}
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
      <span class="truncate">
        <Name pubkey={props.event.pubkey} />
      </span>
      <span class="shrink-0">がリポスト</span>
    </p>
    <Show when={props.size === "normal"}>
      <Show
        when={repostTarget(props.event)}
        fallback={<Notice>リポスト元が指定されていません</Notice>}
      >
        {(ref) => (
          <Lookup target={ref()} missing="リポスト元を読み込めませんでした">
            {(event) => <EventContent event={event} size={props.size} />}
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
      <Note event={props.event} size={props.size} />
    </Match>
    <Match when={props.event.kind === 6 || props.event.kind === 16}>
      <Repost event={props.event} size={props.size} />
    </Match>
  </Switch>
);

/** 手元にあるイベントを 1 件描く。 */
const Event: Component<ContentProps> = (props) => (
  <Frame size={props.size}>
    <EventContent event={props.event} size={props.size} />
  </Frame>
);

/** id しか分からないイベントを取りにいって描く。 */
export const EventRefView: Component<{
  target: { id: string; relay?: RelayUrl };
  size: EventSize;
}> = (props) => (
  <Frame size={props.size}>
    <Lookup target={props.target} missing="読み込めませんでした">
      {(event) => <EventContent event={event} size={props.size} />}
    </Lookup>
  </Frame>
);

export default Event;
