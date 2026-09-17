import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  formatEventTime,
  formatEventTimeFull,
} from "@streets/core/view/format-time";
import {
  type NotificationAction,
  actionTarget,
  groupActors,
  groupReactionContents,
} from "@streets/core/view/notification-rows";
import { observeWidth } from "@streets/core/view/shared-resize-observer";
import { type Component, For, Show, createSignal, onCleanup } from "solid-js";
import { useDispatch } from "../ui-events";
import Avatar from "./Avatar";
import { EventRefView, type EventSize } from "./Event";
import { Mark } from "./ReactionList";
import UserLink from "./UserLink";

// 1 人ぶんのアイコンの幅と、並べるときの間隔（px）。`Avatar` の大きさと合わせる。
const AVATAR_PX = { compact: 32, tiny: 20 } as const;
const AVATAR_GAP = { compact: 4, tiny: -6 } as const;

/**
 * 操作した人のアイコンを、入るだけ並べる。入らない分は +N にする。カラムの幅は
 * 変えられるので、人数を固定しない。並べられる幅は親から受け取る（自分の幅で
 * 数えると、減らした分だけ自分が縮み、また減らす —— と止まらなくなる）。
 */
const AvatarRow: Component<{
  pubkeys: readonly string[];
  size: "compact" | "tiny";
  /** 並べてよい幅（px）。 */
  budget: number;
}> = (props) => {
  const shown = () => {
    const avatar = AVATAR_PX[props.size];
    const step = avatar + AVATAR_GAP[props.size];
    const total = props.pubkeys.length;
    const all = avatar + (total - 1) * step;
    if (all <= props.budget) return total;
    // +N の札も 1 人ぶんの場所を取る。
    const fit = Math.floor((props.budget - avatar) / step);
    return Math.max(1, Math.min(total - 1, fit));
  };
  const hidden = () => props.pubkeys.length - shown();

  return (
    <div
      class="flex shrink-0 items-center"
      classList={{ "gap-1": props.size === "compact" }}
    >
      <For each={props.pubkeys.slice(0, shown())}>
        {(pubkey, index) => (
          <span
            class="flex"
            // 重ねるときは、下の人と区別できるよう背景色で縁取る。
            classList={{
              "-ml-1.5": props.size === "tiny" && index() > 0,
              "rounded-1.5 ring-2 ring-white dark:ring-ui-950":
                props.size === "tiny",
            }}
          >
            <Avatar pubkey={pubkey} size={props.size} />
          </span>
        )}
      </For>
      <Show when={hidden() > 0}>
        <span
          class="c-secondary grid shrink-0 place-items-center bg-secondary font-600"
          classList={{
            "size-8 rounded-2 text-caption": props.size === "compact",
            "ml-1 h-5 rounded-1.5 px-1 text-[11px]": props.size === "tiny",
          }}
        >
          +{hidden()}
        </span>
      </Show>
    </div>
  );
};

/**
 * 「あいもの ほか 8 人が 🥰 🎉 でリアクション」。入り切らないときは、絵文字の列、
 * 後ろの文、名前の順に縮める（誰がしたかを最後まで残す）。
 */
const Summary: Component<{
  events: readonly NostrEvent[];
  action: NotificationAction;
  size: EventSize;
}> = (props) => {
  const actors = () => groupActors(props.events);
  const others = () => actors().length - 1;
  const contents = () =>
    props.action === "reaction" ? groupReactionContents(props.events) : [];
  // 1 件のいいねは「がいいね」と言い切る方が、ハートを並べるより読みやすい。
  const plainLike = () =>
    props.size === "normal" &&
    contents().length === 1 &&
    contents()[0]?.type === "like";

  return (
    <p
      // 入り切らないときは、はみ出させずに切る（名前から先に縮む）。
      class="c-secondary flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap"
      classList={{
        "text-body": props.size === "normal",
        "text-[14px]": props.size === "compact",
      }}
    >
      <Show when={actors()[0]}>
        {(pubkey) => (
          <UserLink
            pubkey={pubkey()}
            class="c-primary max-w-1/2 shrink-0 truncate font-600"
          />
        )}
      </Show>
      <Show when={others() > 0}>
        <span class="shrink-0">ほか {others()} 人</span>
      </Show>
      <Show
        when={props.action === "reaction"}
        fallback={<span class="min-w-0 shrink-[2] truncate">がリポスト</span>}
      >
        <Show
          when={!plainLike()}
          fallback={<span class="min-w-0 shrink-[2] truncate">がいいね</span>}
        >
          <span class="shrink-0">が</span>
          {/* 絵文字が多いときは、入る分だけ見せる。 */}
          <span class="flex min-w-4 shrink-[4] items-center gap-0.5 overflow-hidden">
            <For each={contents()}>
              {(content) => (
                <span class="flex shrink-0 items-center">
                  <Mark content={content} mine={false} />
                </span>
              )}
            </For>
          </span>
          <Show when={props.size === "normal"}>
            <span class="min-w-0 shrink-[2] truncate">でリアクション</span>
          </Show>
        </Show>
      </Show>
    </p>
  );
};

const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("a, button, input, textarea, [role='button']") !== null;

/**
 * 通知に流れるリアクション・リポスト。主役は「誰が何をしたか」で、対象のノートは
 * どちらの密度でも compact の枠で下に出す。`events` が 2 件以上なら、まとめた 1 行になる。
 */
const ActionNotice: Component<{
  /** 新しい順。すべて同じノートへの同じ操作。 */
  events: readonly NostrEvent[];
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const target = () => {
    const first = props.events[0];
    return first ? actionTarget(first) : undefined;
  };
  const action = (): NotificationAction =>
    target()?.action ?? (props.events[0]?.kind === 7 ? "reaction" : "repost");
  const newest = () => new Date((props.events[0]?.created_at ?? 0) * 1000);
  const actors = () => groupActors(props.events);
  const grouped = () => actors().length > 1;

  // アイコンを並べてよい幅を、見出しの行の幅から決める。密度を切り替えると行が
  // 作り直されるので、行ができるたびに見直す（行が消えれば監視も外れる）。
  const [rowWidth, setRowWidth] = createSignal(0);
  const [timeWidth, setTimeWidth] = createSignal(0);
  const measure = (row: HTMLDivElement) =>
    onCleanup(observeWidth(row, setRowWidth));
  // 時刻の幅も測る。今日なら「12:34」、古ければ日付まで出るので、決め打ちにできない。
  const measureTime = (time: HTMLTimeElement) =>
    onCleanup(observeWidth(time, setTimeWidth));
  // アイコンを並べてよい幅。ゆったりは時刻を除いた残り全部、高密度は同じ行の文にも半分以上を残す。
  const budget = () => {
    const rest = rowWidth() - timeWidth() - 8;
    return props.size === "normal"
      ? Math.max(0, rest)
      : Math.max(0, (rest - 14 - 16) * 0.45);
  };

  const icon = () =>
    action() === "reaction"
      ? "i-material-symbols:favorite-rounded c-accent-5"
      : "i-material-symbols:repeat-rounded c-secondary";

  const time = () => (
    <time
      ref={measureTime}
      class="c-secondary shrink-0 text-caption"
      datetime={newest().toISOString()}
      title={formatEventTimeFull(newest())}
    >
      {formatEventTime(newest(), new Date())}
    </time>
  );

  const targetCard = () => (
    <Show
      when={target()}
      fallback={
        <p class="c-secondary text-caption">対象のノートが指定されていません</p>
      }
    >
      {(current) => (
        <div class="overflow-hidden rounded-2 border border-primary">
          <EventRefView
            target={{ id: current().targetId }}
            size="compact"
            expandMedia={props.expandMedia}
          />
        </div>
      )}
    </Show>
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
    <article
      class="offscreen-skip flex bg-primary"
      classList={{
        "gap-3 p-3": props.size === "normal",
        "flex-col gap-1.5 p-2": props.size === "compact",
        "cursor-pointer": target() !== undefined,
      }}
      onClick={(event) => {
        const current = target();
        if (!current || isInteractive(event.target)) return;
        // 対象のノートの枠の中を押したときは、そのノート自身が開く。
        if (
          event.target instanceof Element &&
          event.target.closest("article") !== event.currentTarget
        ) {
          return;
        }
        dispatch({
          type: "stack/open",
          column: buildThreadColumn(current.targetId),
        });
      }}
    >
      <Show
        when={props.size === "normal"}
        fallback={
          <>
            <div ref={measure} class="flex min-w-0 items-center gap-2">
              <span class={`${icon()} size-3.5 shrink-0`} aria-hidden="true" />
              <AvatarRow pubkeys={actors()} size="tiny" budget={budget()} />
              <Summary events={props.events} action={action()} size="compact" />
              {time()}
            </div>
            <div class="pl-5.5">{targetCard()}</div>
          </>
        }
      >
        <span class={`${icon()} mt-1.5 size-5 shrink-0`} aria-hidden="true" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div ref={measure} class="flex min-w-0 items-center gap-2">
            <Show
              when={grouped()}
              fallback={
                <>
                  <Avatar pubkey={actors()[0] ?? ""} size="compact" />
                  <Summary
                    events={props.events}
                    action={action()}
                    size="normal"
                  />
                </>
              }
            >
              <div class="min-w-0 flex-1">
                <AvatarRow
                  pubkeys={actors()}
                  size="compact"
                  budget={budget()}
                />
              </div>
            </Show>
            {time()}
          </div>
          <Show when={grouped()}>
            <Summary events={props.events} action={action()} size="normal" />
          </Show>
          {targetCard()}
        </div>
      </Show>
    </article>
  );
};

export default ActionNotice;
