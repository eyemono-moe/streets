import { type Component, For, Match, Switch } from "solid-js";
import { EventRefView, type EventSize } from "../note/Event";

/**
 * ピン留めした投稿の一覧。投稿のタブとは分けて置く —— Nostr のピン留めは
 * いくつでも付けられ、同じ一覧に混ぜると、どこまでがピン留めか分からなくなる。
 */
const PinnedNotesView: Component<{
  ids: readonly string[];
  /** 一覧を取り終えたか。まだなら「ありません」と言わない。 */
  settled: boolean;
  size: EventSize;
  expandMedia?: boolean;
}> = (props) => (
  <Switch>
    <Match when={props.ids.length > 0}>
      <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
        <For each={props.ids}>
          {(id) => (
            <EventRefView
              target={{ form: "id", id }}
              size={props.size}
              expandMedia={props.expandMedia}
            />
          )}
        </For>
      </div>
    </Match>
    <Match when={props.settled}>
      <p class="c-secondary p-4 text-caption">ピン留めした投稿はありません。</p>
    </Match>
    <Match when={true}>
      <p class="c-secondary p-4 text-caption">読み込み中…</p>
    </Match>
  </Switch>
);

export default PinnedNotesView;
