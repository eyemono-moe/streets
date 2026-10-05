import { Presence } from "@ark-ui/solid/presence";
import type { MessageVisibility } from "@streets/core/nostr/channel";
import type { Paging } from "@streets/core/read/source";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ChatRow } from "@streets/core/view/chat";
import {
  type Component,
  type JSX,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import Button from "../ui/Button";
import { holdsScroll } from "../ui/scroll-hold";
import VirtualList from "../ui/VirtualList";
import { ChatMessage, HiddenChatMessage } from "./ChatMessage";

/** 畳む理由。そのまま出す発言は `undefined`。 */
const hiddenReason = (
  visibility: MessageVisibility,
): Exclude<MessageVisibility, "visible"> | undefined =>
  visibility === "visible" ? undefined : visibility;

/** 一番下から、これだけ離れていなければ「一番下にいる」とみなす。 */
const BOTTOM_SLOP = 24;

const dayLabel = (at: number): string => {
  const date = new Date(at * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "今日";
  if (same(date, yesterday)) return "昨日";
  return date.toLocaleDateString("ja-JP", {
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
};

/** 日付の区切りか、1 件の発言。 */
const ChatRowView: Component<{
  row: ChatRow;
  relays: readonly RelayUrl[];
  expandMedia: boolean;
}> = (props) => (
  <Switch>
    <Match when={props.row.type === "day" && props.row}>
      {(day) => (
        <div
          class="c-secondary flex items-center gap-2 px-3 py-2 text-caption"
          role="separator"
        >
          <span class="h-px flex-1 bg-tertiary" />
          {dayLabel(day().at)}
          <span class="h-px flex-1 bg-tertiary" />
        </div>
      )}
    </Match>
    <Match when={props.row.type === "message" && props.row}>
      {(message) => (
        <Show
          when={hiddenReason(message().visibility)}
          fallback={
            <ChatMessage
              event={message().event}
              continued={message().continued}
              relays={props.relays}
              expandMedia={props.expandMedia}
            />
          }
        >
          {(visibility) => (
            <HiddenChatMessage
              event={message().event}
              visibility={visibility()}
              relays={props.relays}
              expandMedia={props.expandMedia}
            />
          )}
        </Show>
      )}
    </Match>
  </Switch>
);

/**
 * チャンネルの発言を古い順に並べ、下に入力欄を置く。
 *
 * スクロール領域は `flex-direction: column-reverse` にする。位置の基準が一番下に
 * なるので、開いたときに一番下から始まり、一番下にいれば新しい発言が来ても下に
 * 留まる。上へ古い発言を足しても、読んでいる位置はずれない。発言は仮想リストで、
 * 見えている行とその前後だけを置く（遡れる件数に上限が無いので）。
 */
const ChatView: Component<{
  rows: readonly ChatRow[];
  relays: readonly RelayUrl[];
  expandMedia: boolean;
  paging: Paging;
  settled: boolean;
  onLoadOlder: () => void;
  composer: JSX.Element;
}> = (props) => {
  let scroller: HTMLDivElement | undefined;
  let top: HTMLDivElement | undefined;
  const [atBottom, setAtBottom] = createSignal(true);
  const [unseen, setUnseen] = createSignal(0);

  const lastKey = () => {
    const last = props.rows.at(-1);
    return last?.type === "message" ? last.key : undefined;
  };
  // 一番下にいないときに新しい発言が来たら、数えて「新しい発言 N 件」を出す。
  createEffect(
    on(lastKey, (key, previous) => {
      if (key === undefined || previous === undefined || key === previous) {
        return;
      }
      // 操作していて動かさなかったときも、一番下にいたまま見えない所へ入る。
      if (!atBottom() || (scroller && holdsScroll(scroller))) {
        setUnseen((count) => count + 1);
      }
    }),
  );

  /** 一番下へ送っている途中。途中で発言が届いても、位置を保たずに下まで送り切る。 */
  let returning = false;
  const lastUnseen = createMemo<number>(
    (previous) => (unseen() > 0 ? unseen() : previous),
    0,
  );
  const toBottom = () => {
    returning = true;
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
    setUnseen(0);
  };

  onMount(() => {
    const element = scroller;
    if (!element) return;
    // column-reverse では一番下が 0 で、上へ行くほど負になる。
    const update = () => {
      const bottom = element.scrollTop >= -BOTTOM_SLOP;
      setAtBottom(bottom);
      if (bottom) {
        setUnseen(0);
        returning = false;
      }
    };
    element.addEventListener("scroll", update, { passive: true });
    onCleanup(() => element.removeEventListener("scroll", update));

    // column-reverse は下を基準に位置を保つので、発言が増えると見ている発言が上へ
    // 押し上げられる。一番下で追っているとき以外（遡って読んでいる、操作している）は
    // 上からの距離を保ち、見ている発言を動かさない。上に古い発言を足したときは、
    // 下の基準のままで動かないので戻さない。
    // ResizeObserver は描く前に呼ばれるので、動いて戻る様子は見えない。
    const fromTop = () =>
      element.scrollHeight - element.clientHeight + element.scrollTop;
    let kept = fromTop();
    let keptKey = lastKey();
    const keep = () => {
      const key = lastKey();
      const reading = !atBottom() && !returning;
      if (key !== keptKey && (reading || holdsScroll(element))) {
        element.scrollTop =
          kept - (element.scrollHeight - element.clientHeight);
      }
      keptKey = key;
      kept = fromTop();
    };
    const remember = () => {
      kept = fromTop();
    };
    element.addEventListener("scroll", remember, { passive: true });
    onCleanup(() => element.removeEventListener("scroll", remember));
    const content = new ResizeObserver(keep);
    if (element.firstElementChild) content.observe(element.firstElementChild);
    onCleanup(() => content.disconnect());

    // 一番上が見えたら、古い発言を取り足す。
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) props.onLoadOlder();
      },
      { root: element, rootMargin: "200px 0px 0px 0px" },
    );
    if (top) observer.observe(top);
    onCleanup(() => observer.disconnect());

    // 最初のページが揃ったときや、取り足しても一番上がまだ見えているときは、交わりが
    // 変わらないので通知が来ない。見張り直して、今の状態をもう一度受け取る。
    createEffect(
      on(
        () => props.paging,
        (paging) => {
          if (paging !== "idle" || !top) return;
          observer.unobserve(top);
          observer.observe(top);
        },
        { defer: true },
      ),
    );
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="relative flex min-h-0 flex-1 flex-col">
        {/* スクロールアンカーは切る。仮想リストの行は絶対配置でアンカーにならず、
            ブラウザは上端の「読み込み中」を選んで保つので、一番上で古い発言を足すと
            一番上に留まってしまう。位置は column-reverse の下の基準だけで保つ。 */}
        <div
          ref={scroller}
          data-scroll-container
          class="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain [overflow-anchor:none]"
        >
          <div class="flex flex-col pb-2">
            <div
              ref={top}
              class="c-secondary px-3 py-3 text-center text-caption"
            >
              <Switch>
                <Match
                  when={props.paging === "waiting" && props.rows.length > 0}
                >
                  ほかのリレーから届くのを待っています…
                </Match>
                <Match when={props.paging === "loading"}>
                  古い発言を読み込み中…
                </Match>
                <Match
                  when={props.paging === "exhausted" && props.rows.length > 0}
                >
                  これより前の発言はありません
                </Match>
                <Match when={props.paging === "failed"}>
                  <div class="flex flex-col items-center gap-2">
                    <p>古い発言を読み込めませんでした</p>
                    <Button size="sm" onClick={() => props.onLoadOlder()}>
                      もう一度読み込む
                    </Button>
                  </div>
                </Match>
              </Switch>
            </div>
            <Switch>
              <Match when={props.rows.length > 0}>
                <VirtualList
                  items={props.rows}
                  itemKey={(row) => row.key}
                  estimateSize={64}
                  reversed
                >
                  {(row) => (
                    <ChatRowView
                      row={row}
                      relays={props.relays}
                      expandMedia={props.expandMedia}
                    />
                  )}
                </VirtualList>
              </Match>
              <Match when={props.settled}>
                <p class="c-secondary p-4 text-center text-caption">
                  まだ発言がありません。最初のひとことをどうぞ。
                </p>
              </Match>
              <Match when={true}>
                <p class="c-secondary p-4 text-center text-caption">
                  読み込み中…
                </p>
              </Match>
            </Switch>
          </div>
        </div>
        <Presence
          lazyMount
          unmountOnExit
          present={unseen() > 0}
          class="motion-pop pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
        >
          <Button
            variant="primary"
            size="sm"
            class="pointer-events-auto shadow-sm"
            onClick={toBottom}
          >
            {/* 消えていく間に 0 件と出さない。 */}
            新しい発言 {lastUnseen()} 件
          </Button>
        </Presence>
      </div>
      {props.composer}
    </div>
  );
};

export default ChatView;
