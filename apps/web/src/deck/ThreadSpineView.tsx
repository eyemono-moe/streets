import type { NostrEvent } from "@streets/core/nostr/event";
import type { ThreadSpine } from "@streets/core/view/thread-spine";
import { type Component, For, Show } from "solid-js";
import Event from "../note/Event";

/**
 * 1 本の背骨の見た目だけを持つ。祖先と返信は compact、焦点だけ normal ——
 * どれを開いているかが、前後に埋もれないようにする。
 */
const ThreadSpineView: Component<{
  spine: ThreadSpine;
  /** 根まで辿れないことを黙らせるか。取得が続いている間は出さない。 */
  settled: boolean;
  expandMedia: boolean;
}> = (props) => (
  <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
    {/* 途中が欠けると「根から始まる」ように見えるので、そのときは断っておく。 */}
    <Show when={!props.spine.reachedRoot && props.settled}>
      <p class="c-secondary bg-primary px-3 py-2 text-caption">
        このスレッドの上の方は取得できませんでした。
      </p>
    </Show>
    <For each={props.spine.ancestors}>
      {(event: NostrEvent, index) => (
        <Event
          event={event}
          size="compact"
          expandMedia={props.expandMedia}
          // 上にも下にも投稿があるなら線は通り抜ける。根（か、根が取れていない先頭）だけ下向き。
          threadLine={
            index() === 0 && props.spine.reachedRoot ? "below" : "both"
          }
        />
      )}
    </For>
    <Show
      when={props.spine.focus}
      fallback={
        <p class="c-secondary bg-primary p-4 text-caption">読み込み中…</p>
      }
    >
      {(focus) => (
        <Event
          event={focus()}
          size="normal"
          expandMedia={props.expandMedia}
          threadLine={props.spine.ancestors.length > 0 ? "above" : undefined}
        />
      )}
    </Show>
    <For each={props.spine.replies}>
      {(event) => (
        <Event event={event} size="compact" expandMedia={props.expandMedia} />
      )}
    </For>
  </div>
);

export default ThreadSpineView;
