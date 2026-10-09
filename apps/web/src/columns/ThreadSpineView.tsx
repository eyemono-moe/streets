import type { NostrEvent } from "@streets/core/nostr/event";
import type { ThreadSpine } from "@streets/core/view/thread-spine";
import { type Component, For, Show } from "solid-js";
import Event, { EventRefView } from "../note/Event";
import MutedGate from "../note/MutedGate";
import { keepInView } from "./keep-in-view";

/**
 * 1 本の背骨の見た目だけを持つ。祖先と返信は compact、焦点だけ normal ——
 * どれを開いているかが、前後に埋もれないようにする。
 */
const ThreadSpineView: Component<{
  spine: ThreadSpine;
  /** 上の方を取り終えたか。取り終えるまでは、欠けていても「読み込み中」と出す。 */
  settled: boolean;
  expandMedia: boolean;
  /** 開いた投稿の前後で、ミュートに当たる投稿を畳む。開いた投稿そのものは畳まない。 */
  foldsMuted?: boolean;
}> = (props) => {
  // 上に投稿が届く、読み込み中の行が消えるなど、焦点より上の高さが変わったら置き直す。
  let thread: HTMLDivElement | undefined;
  return (
    <div ref={thread} class="flex flex-col [&>*]:border-primary [&>*]:border-b">
      {/* 途中が欠けると「根から始まる」ように見えるので、そのときは断っておく。 */}
      <Show when={!props.spine.reachedRoot && props.spine.focus}>
        <p class="c-secondary bg-primary px-3 py-2 text-caption">
          {props.settled
            ? "このスレッドの上の方は取得できませんでした。"
            : "このスレッドの上の方を読み込み中…"}
        </p>
      </Show>
      {/* 祖先から焦点までは線でつながる 1 本なので、間に区切りを引かない。タイムラインで返信先を上に置くときと同じ見え方にする。 */}
      <div class="flex flex-col">
        {/* 記事などへのコメントのスレッドは、そのコメントが付いた先を一番上に置く。 */}
        <Show when={props.spine.scopeRoot}>
          {(target) => (
            <EventRefView
              target={target()}
              size="compact"
              expandMedia={props.expandMedia}
              threadLine="below"
            />
          )}
        </Show>
        <For each={props.spine.ancestors}>
          {(event: NostrEvent, index) => (
            <MutedGate event={event} active={props.foldsMuted === true}>
              <Event
                event={event}
                size="compact"
                expandMedia={props.expandMedia}
                stickyAvatar
                withinScope={props.spine.scopeRoot !== undefined}
                // 上にも下にも投稿があるなら線は通り抜ける。根（か、根が取れていない先頭）だけ下向き。
                threadLine={
                  index() === 0 &&
                  props.spine.reachedRoot &&
                  !props.spine.scopeRoot
                    ? "below"
                    : "both"
                }
              />
            </MutedGate>
          )}
        </For>
        <Show
          when={props.spine.focus}
          fallback={
            <p class="c-secondary bg-primary p-4 text-caption">読み込み中…</p>
          }
        >
          {(focus) => (
            // 長いスレッドでも、開いた投稿が見える位置から始める。
            <div ref={(element) => keepInView(element, () => thread)}>
              <Event
                event={focus()}
                size="normal"
                expandMedia={props.expandMedia}
                fullBody
                stickyAvatar
                withinScope={props.spine.scopeRoot !== undefined}
                threadLine={
                  props.spine.ancestors.length > 0 || props.spine.scopeRoot
                    ? "above"
                    : undefined
                }
              />
            </div>
          )}
        </Show>
      </div>
      <For each={props.spine.replies}>
        {(event) => (
          <MutedGate event={event} active={props.foldsMuted === true}>
            <Event
              event={event}
              size="compact"
              expandMedia={props.expandMedia}
              withinScope={props.spine.scopeRoot !== undefined}
            />
          </MutedGate>
        )}
      </For>
    </div>
  );
};

export default ThreadSpineView;
