import { parseContent } from "@streets/core/nostr/content";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type EventRef,
  replyTarget,
  repostTarget,
} from "@streets/core/nostr/event-refs";
import { profileLabel } from "@streets/core/nostr/profile";
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
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import Avatar from "./Avatar";
import NoteText from "./NoteText";
import { type EventLookup, useEvent } from "./use-event";
import { useProfile } from "./use-profile";

const Name: Component<{ pubkey: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  return <>{profileLabel(profile(), props.pubkey)}</>;
};

const Names: Component<{ pubkey: string; size: "note" | "quote" }> = (
  props,
) => {
  const profile = useProfile(() => props.pubkey);
  return (
    <span class="flex min-w-0 flex-1 items-end gap-1.5">
      <span
        class="c-primary truncate font-600"
        classList={{
          "text-body": props.size === "note",
          "text-caption": props.size === "quote",
        }}
      >
        {profileLabel(profile(), props.pubkey)}
      </span>
      {/* display_name が無いと太字側が name に落ちるので、同じ文字列を 2 回並べない。 */}
      <Show when={profile()?.displayName && profile()?.name}>
        {(name) => (
          <span class="c-secondary min-w-0 truncate text-caption">
            @{name()}
          </span>
        )}
      </Show>
    </span>
  );
};

const Time: Component<{ event: NostrEvent }> = (props) => {
  const date = () => new Date(props.event.created_at * 1000);
  return (
    <time
      class="c-secondary shrink-0 text-caption"
      datetime={date().toISOString()}
      title={formatEventTimeFull(date())}
    >
      {formatEventTime(date(), new Date())}
    </time>
  );
};

const Notice: Component<{ children: JSX.Element }> = (props) => (
  <p class="c-secondary text-caption">{props.children}</p>
);

/** 取得中と見つからなかったを別の文言で出す。 */
const Lookup: Component<{
  lookup: EventLookup;
  missing: string;
  children: (event: NostrEvent) => JSX.Element;
}> = (props) => (
  <Switch>
    <Match when={props.lookup.phase === "found" && props.lookup}>
      {(found) => props.children(found().event)}
    </Match>
    <Match when={props.lookup.phase === "missing"}>
      <Notice>{props.missing}</Notice>
    </Match>
    <Match when={true}>
      <Notice>読み込み中…</Notice>
    </Match>
  </Switch>
);

const MediaImage: Component<{ url: string }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show
      when={!broken()}
      fallback={
        <a
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
          class="break-all text-body text-link"
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
          class="block h-45 w-full rounded-2 bg-secondary object-cover"
          onError={() => setBroken(true)}
        />
      </a>
    </Show>
  );
};

// 引用の中では関連イベントを取りにいかない。入れ子を 1 段で止め、1 件の投稿が取得を連鎖させないため。
const QuoteBody: Component<{ event: NostrEvent }> = (props) => {
  const tokens = createMemo(() =>
    parseContent(props.event.content.trim(), props.event.tags),
  );
  return (
    <>
      <div class="flex items-end gap-1.5">
        <Avatar pubkey={props.event.pubkey} size="quote" />
        <Names pubkey={props.event.pubkey} size="quote" />
      </div>
      <Show when={tokens().length > 0}>
        <NoteText tokens={tokens()} class="c-secondary text-caption" />
      </Show>
    </>
  );
};

const Quote: Component<{ quote: EventRef }> = (props) => (
  <div class="flex w-full flex-col gap-1 rounded-2 border border-primary bg-primary p-2.5">
    <Show
      when={props.quote.form === "id" && props.quote}
      fallback={<Notice>未対応の参照です</Notice>}
    >
      {(ref) => {
        const lookup = useEvent(ref);
        return (
          <Lookup lookup={lookup()} missing="引用元を読み込めませんでした">
            {(event) => <QuoteBody event={event} />}
          </Lookup>
        );
      }}
    </Show>
  </div>
);

const Note: Component<{ event: NostrEvent }> = (props) => {
  const layout = createMemo(() => layoutNote(props.event));
  const replyTo = () => replyTarget(props.event)?.pubkey;

  return (
    <div class="flex items-start gap-3">
      <Avatar pubkey={props.event.pubkey} size="note" />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex items-end gap-1.5">
          <Names pubkey={props.event.pubkey} size="note" />
          <Time event={props.event} />
        </div>
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
          <NoteText tokens={layout().text} class="c-primary text-body" />
        </Show>
        <For each={layout().images}>{(url) => <MediaImage url={url} />}</For>
        <For each={layout().quotes}>{(quote) => <Quote quote={quote} />}</For>
      </div>
    </div>
  );
};

const Repost: Component<{ event: NostrEvent }> = (props) => {
  const target = () => repostTarget(props.event);

  return (
    <>
      <p class="c-secondary flex min-w-0 items-center gap-1.5 text-caption">
        <span class="i-material-symbols:repeat-rounded size-3.5 shrink-0" />
        <span class="truncate">
          <Name pubkey={props.event.pubkey} />
        </span>
        <span class="shrink-0">がリポスト</span>
      </p>
      <Show
        when={target()}
        fallback={<Notice>リポスト元が指定されていません</Notice>}
      >
        {(ref) => {
          const lookup = useEvent(ref);
          return (
            <Lookup
              lookup={lookup()}
              missing="リポスト元を読み込めませんでした"
            >
              {(event) => (
                <Show
                  when={event.kind === 1}
                  fallback={<Notice>表示できない種類の投稿です</Notice>}
                >
                  <Note event={event} />
                </Show>
              )}
            </Lookup>
          );
        }}
      </Show>
    </>
  );
};

const TimelineItem: Component<{ event: NostrEvent }> = (props) => (
  <article class="flex flex-col gap-2 bg-primary p-3">
    <Show when={props.event.kind === 6} fallback={<Note event={props.event} />}>
      <Repost event={props.event} />
    </Show>
  </article>
);

export default TimelineItem;
