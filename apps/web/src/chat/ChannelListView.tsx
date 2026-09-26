import type { ChannelEntry } from "@streets/core/view/channel-directory";
import { type Component, For, type JSX, Match, Show, Switch } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import { searchInputClass } from "../ui/TextField";
import ChannelPicture from "./ChannelPicture";

/** 最後の発言の時刻。今日なら時刻、それ以外は日付。直近に無ければ「しばらく前」。 */
const lastLabel = (at: number | undefined): string => {
  if (at === undefined) return "しばらく前";
  const date = new Date(at * 1000);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
};

const ChannelRow: Component<{
  entry: ChannelEntry;
  onOpen: (entry: ChannelEntry) => void;
  onPeek?: (entry: ChannelEntry) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const name = () =>
    props.entry.channel.metadata.name ?? "名前の無いチャンネル";
  return (
    <li class="flex items-center gap-2.5 bg-primary px-3 py-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent p-0 text-left"
        onClick={() => props.onOpen(props.entry)}
      >
        <ChannelPicture
          url={props.entry.channel.metadata.picture}
          class="size-10 rounded-2"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="c-primary truncate font-600 text-body">{name()}</span>
          <span class="c-secondary truncate text-caption">
            {props.entry.channel.metadata.about ?? "説明がありません"}
          </span>
        </span>
        <span class="c-secondary shrink-0 text-caption">
          {lastLabel(props.entry.lastMessageAt)}
        </span>
      </button>
      <Show when={props.onPeek}>
        {(peek) => (
          <Button
            variant="ghost"
            size="sm"
            shape="rounded"
            icon="i-material-symbols:visibility-outline-rounded"
            aria-label={`${name()} を覗く`}
            title="デッキに足さずに覗く"
            onClick={() => peek()(props.entry)}
          />
        )}
      </Show>
      <Button
        variant="ghost"
        size="sm"
        shape="rounded"
        icon={
          props.entry.favorite
            ? "i-material-symbols:star-rounded c-accent-5"
            : "i-material-symbols:star-outline-rounded"
        }
        aria-label={
          props.entry.favorite
            ? `${name()} をお気に入りから外す`
            : `${name()} をお気に入りに入れる`
        }
        aria-pressed={props.entry.favorite}
        onClick={() =>
          dispatch({
            type: "channel/favorite",
            id: props.entry.channel.id,
            on: !props.entry.favorite,
          })
        }
      />
    </li>
  );
};

/** 探す表示に一度に並べる数。多すぎると描くのが重いので、絞り込んでもらう。 */
const RESULT_LIMIT = 200;

const Section: Component<{
  title: string;
  limit?: number;
  trailing?: JSX.Element;
  entries: readonly ChannelEntry[];
  settled: boolean;
  empty: string;
  onOpen: (entry: ChannelEntry) => void;
  onPeek?: (entry: ChannelEntry) => void;
}> = (props) => (
  <section class="flex flex-col gap-1.5">
    <h3 class="c-secondary flex items-center gap-2 font-600 text-caption">
      <span class="min-w-0 flex-1">{props.title}</span>
      {props.trailing}
    </h3>
    <Switch>
      <Match when={props.entries.length > 0}>
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.entries.slice(0, props.limit ?? Infinity)}>
            {(entry) => (
              <ChannelRow
                entry={entry}
                onOpen={props.onOpen}
                onPeek={props.onPeek}
              />
            )}
          </For>
        </ul>
        <Show
          when={props.limit !== undefined && props.entries.length > props.limit}
        >
          <p class="c-secondary text-caption">
            ほかに {props.entries.length - (props.limit ?? 0)}{" "}
            件あります。名前で絞り込んでください。
          </p>
        </Show>
      </Match>
      <Match when={props.settled}>
        <p class="c-secondary text-caption">{props.empty}</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary text-caption">読み込み中…</p>
      </Match>
    </Switch>
  </section>
);

/**
 * チャンネルの一覧。普段はお気に入りと最近アクティブなチャンネルを出し、
 * 検索欄に焦点を当てるとすべてのチャンネルから探す表示に切り替える。
 */
const ChannelListView: Component<{
  searching: boolean;
  query: string;
  favorites: readonly ChannelEntry[];
  active: readonly ChannelEntry[];
  results: readonly ChannelEntry[];
  favoritesSettled: boolean;
  activeSettled: boolean;
  allSettled: boolean;
  onSearch: (searching: boolean) => void;
  onQuery: (query: string) => void;
  onOpen: (entry: ChannelEntry) => void;
  /** 渡すと、行に「覗く」を出す（カラムを追加のパネルで使う）。 */
  onPeek?: (entry: ChannelEntry) => void;
  /** 渡すと、末尾に「チャンネルを作る」を出す。 */
  onCreate?: () => void;
}> = (props) => {
  let input: HTMLInputElement | undefined;
  return (
    <div class="flex flex-col gap-3 p-3">
      <div class="relative flex items-center">
        <span
          class="i-material-symbols:search-rounded c-secondary pointer-events-none absolute left-3 size-4.5"
          aria-hidden="true"
        />
        <input
          ref={input}
          type="search"
          aria-label="チャンネルを名前で探す"
          placeholder="チャンネルを名前で探す"
          class={`${searchInputClass} w-full pl-9`}
          classList={{ "pr-9": props.searching }}
          value={props.query}
          onFocus={() => props.onSearch(true)}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              props.onSearch(false);
              event.currentTarget.blur();
            }
          }}
        />
        <Show when={props.searching}>
          <Button
            variant="ghost"
            size="sm"
            icon="i-material-symbols:close-rounded"
            aria-label="探すのをやめる"
            class="absolute right-1"
            onClick={() => props.onSearch(false)}
          />
        </Show>
      </div>
      <Show
        when={props.searching}
        fallback={
          <>
            <Section
              title="お気に入りのチャンネル"
              entries={props.favorites}
              settled={props.favoritesSettled}
              empty="★ を押したチャンネルがここに並びます。"
              onOpen={props.onOpen}
              onPeek={props.onPeek}
            />
            <Section
              title="最近アクティブなチャンネル"
              entries={props.active}
              settled={props.activeSettled}
              empty="この 7 日間に発言のあったチャンネルはありません。"
              onOpen={props.onOpen}
              onPeek={props.onPeek}
            />
            <Button
              variant="secondary"
              shape="rounded"
              block
              icon="i-material-symbols:search-rounded"
              onClick={() => {
                props.onSearch(true);
                input?.focus();
              }}
            >
              すべてのチャンネルから探す
            </Button>
            <Show when={props.onCreate}>
              {(create) => (
                <Button
                  variant="primary"
                  icon="i-material-symbols:add-rounded"
                  class="self-start"
                  onClick={() => create()()}
                >
                  チャンネルを作る
                </Button>
              )}
            </Show>
          </>
        }
      >
        <Section
          title="すべてのチャンネル（名前順）"
          limit={RESULT_LIMIT}
          trailing={
            <Show when={props.allSettled}>
              <span class="font-400">{props.results.length} 件</span>
            </Show>
          }
          entries={props.results}
          settled={props.allSettled}
          empty={
            props.query.trim()
              ? "名前や説明に合うチャンネルが見つかりませんでした。"
              : "チャンネルが見つかりませんでした。"
          }
          onOpen={props.onOpen}
          onPeek={props.onPeek}
        />
      </Show>
    </div>
  );
};

export default ChannelListView;
