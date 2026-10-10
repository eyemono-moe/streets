import { buildThreadColumn } from "@streets/core/deck/column-presets";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReactionContent } from "@streets/core/nostr/reaction";
import {
  type NotificationAction,
  actionTarget,
  distinctReactions,
  groupActors,
} from "@streets/core/view/notification-rows";
import { observeWidth } from "@streets/core/view/shared-resize-observer";
import { type Component, For, Show, createSignal, onCleanup } from "solid-js";
import { useDispatch } from "../ui-events";
import Avatar from "./Avatar";
import { EventRefView, type EventSize } from "./Event";
import EventTime from "./EventTime";
import QuoteBox from "./QuoteBox";
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
 * 「あいもの ほか 8 人がリアクション」。リアクションの中身は行頭の欄に出す。
 * 入り切らないときは、後ろの文、名前の順に縮める（誰がしたかを最後まで残す）。
 */
const Summary: Component<{
  events: readonly NostrEvent[];
  action: NotificationAction;
  size: EventSize;
}> = (props) => {
  const actors = () => groupActors(props.events);
  const others = () => actors().length - 1;
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
        <span class="min-w-0 shrink-[2] truncate">がリアクション</span>
      </Show>
    </p>
  );
};

const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("a, button, input, textarea, [role='button']") !== null;

// 行頭の欄の幅（px）。絵文字 2 つ分で固定し、リアクションの行もリポストの行も
// 同じ幅にして、アバターや名前の位置を縦にそろえる。
const SLOT_PX = { normal: 40, compact: 28 } as const;
const MARK_PX = { normal: 20, compact: 14 } as const;
// 欄に並べる種類の数。これを超えた分は +N にする。
const MAX_MARKS = 3;

const markTitle = (content: ReactionContent) =>
  content.type === "like"
    ? "♥"
    : content.type === "emoji"
      ? `:${content.name}:`
      : content.content;

/**
 * 行頭の欄。リアクションは新しい順に最大 3 種類を重ねて並べ、4 種類目からは +N を
 * 付ける。重なり具合は欄の幅から決めるので、何個並べても幅は変わらない。
 * 1 種類だけの行とリポストの行は左寄せ。
 */
const LeadSlot: Component<{
  events: readonly NostrEvent[];
  action: NotificationAction;
  size: EventSize;
}> = (props) => {
  const slot = () => SLOT_PX[props.size];
  const mark = () => MARK_PX[props.size];
  const reactions = () =>
    props.action === "reaction"
      ? distinctReactions(props.events, MAX_MARKS)
      : undefined;
  // 空・解釈できないときは、今までどおりハートにする。
  const marks = (): ReactionContent[] => {
    const shown = reactions()?.shown ?? [];
    return shown.length > 0 ? shown : [{ type: "like" }];
  };
  const count = () => marks().length + ((reactions()?.rest ?? 0) > 0 ? 1 : 0);
  const step = () => (count() > 1 ? (slot() - mark()) / (count() - 1) : 0);
  const title = () => {
    const current = reactions();
    if (!current) return undefined;
    const text = marks().map(markTitle).join(" ");
    return current.rest > 0 ? `${text} ほか` : text;
  };

  return (
    <div
      class="relative shrink-0"
      style={{ width: `${slot()}px`, height: `${mark()}px` }}
      title={title()}
    >
      <Show
        when={props.action === "reaction"}
        fallback={
          <span
            class="i-material-symbols:repeat-rounded c-secondary absolute left-0 top-0"
            classList={{
              "size-5": props.size === "normal",
              "size-3.5": props.size === "compact",
            }}
            aria-hidden="true"
          />
        }
      >
        <For each={marks()}>
          {(content, index) => (
            <span
              class="absolute top-0 flex items-center justify-center overflow-hidden"
              // 新しいリアクションを手前に出す。
              style={{
                left: `${index() * step()}px`,
                width: `${mark()}px`,
                height: `${mark()}px`,
                "z-index": count() - index(),
              }}
              aria-hidden="true"
            >
              <Mark content={content} mine={false} size={props.size} />
            </span>
          )}
        </For>
        <Show when={(reactions()?.rest ?? 0) > 0}>
          <span
            class="c-secondary absolute top-0 grid place-items-center rounded-1.5 bg-secondary font-600"
            classList={{
              "text-[11px]": props.size === "normal",
              "text-[9px]": props.size === "compact",
            }}
            style={{
              left: `${marks().length * step()}px`,
              width: `${mark()}px`,
              height: `${mark()}px`,
            }}
            aria-hidden="true"
          >
            +{reactions()?.rest}
          </span>
        </Show>
      </Show>
    </div>
  );
};

/**
 * 通知に流れるリアクション・リポスト。主役は「誰が何をしたか」で、対象のノートは
 * どちらの密度でも compact の枠で下に出す。`events` が 2 件以上なら、まとめた 1 行になる。
 */
const ActionNotice: Component<{
  /** 新しい順。すべて同じノートへの同じ操作。 */
  events: readonly NostrEvent[];
  size: EventSize;
  expandMedia?: boolean;
  /**
   * 対象のノートがミュートの対象に当たるなら畳む。他人の投稿への反応を流すところで使う。
   * 通知の対象は自分の投稿なので要らない。
   */
  gateMuted?: boolean;
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
  // アイコンを並べてよい幅。行の頭の操作のアイコンと時刻を除き、ゆったりは残り全部、
  // 高密度は同じ行の文にも半分以上を残す。
  const budget = () => {
    const rest = rowWidth() - timeWidth() - 8;
    return props.size === "normal"
      ? Math.max(0, rest - SLOT_PX.normal - 8)
      : Math.max(0, (rest - SLOT_PX.compact - 16) * 0.45);
  };

  const time = () => (
    <EventTime ref={measureTime} class="shrink-0" at={newest()} />
  );

  const targetCard = () => (
    <Show
      when={target()}
      fallback={
        <p class="c-secondary text-caption">対象のノートが指定されていません</p>
      }
    >
      {(current) => (
        <QuoteBox>
          <EventRefView
            target={{ form: "id", id: current().targetId }}
            size="compact"
            expandMedia={props.expandMedia}
            gateMuted={props.gateMuted}
          />
        </QuoteBox>
      )}
    </Show>
  );

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- キーボードでスレッドを開く経路はまだ無い（押せるのはポインタだけ）
    <article
      class="flex flex-col bg-primary"
      classList={{
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
          from: current.targetId,
        });
      }}
    >
      {/*
        画面の外を飛ばすのは中身だけ。`article` そのものに当てると、下線が端数の
        位置で丸められて消えることがある。
      */}
      <div
        class="offscreen-skip flex flex-col"
        classList={{
          "gap-2 p-3": props.size === "normal",
          "gap-1.5 p-2": props.size === "compact",
        }}
      >
        <div ref={measure} class="flex min-w-0 items-center gap-2">
          <LeadSlot events={props.events} action={action()} size={props.size} />
          <Show
            when={props.size === "normal"}
            fallback={
              <>
                <AvatarRow pubkeys={actors()} size="tiny" budget={budget()} />
                <Summary
                  events={props.events}
                  action={action()}
                  size="compact"
                />
              </>
            }
          >
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
          </Show>
          {time()}
        </div>
        <Show when={props.size === "normal" && grouped()}>
          <Summary events={props.events} action={action()} size="normal" />
        </Show>
        {targetCard()}
      </div>
    </article>
  );
};

export default ActionNotice;
