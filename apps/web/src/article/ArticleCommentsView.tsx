import type { CommentRow } from "@streets/core/view/comment-tree";
import { type Component, For, type JSX, Match, Switch } from "solid-js";
import Event, { type EventSize } from "../note/Event";

/** 記事の下に並べるコメント。返信は段を下げて、何への返信かを並びで見せる。 */
const ArticleCommentsView: Component<{
  rows: readonly CommentRow[];
  /** 取り終えたか。まだなら「ありません」と言わない。 */
  settled: boolean;
  size: EventSize;
  expandMedia?: boolean;
  /** 見出しの右に置く操作（コメントを書く）。 */
  trailing?: JSX.Element;
}> = (props) => (
  <section class="flex flex-col border-primary border-t">
    <div class="flex items-center gap-2 px-4 pt-4 pb-2">
      <h2 class="c-secondary flex min-w-0 flex-1 items-center gap-2 font-600 text-caption">
        <span
          class="i-material-symbols:mode-comment-outline-rounded size-4 shrink-0"
          aria-hidden="true"
        />
        コメント
        <span>{props.rows.length > 0 ? props.rows.length : ""}</span>
      </h2>
      {props.trailing}
    </div>
    <Switch>
      <Match when={props.rows.length > 0}>
        <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
          <For each={props.rows}>
            {(row) => (
              <div
                classList={{
                  "pl-3": row.depth === 1,
                  "pl-6": row.depth === 2,
                  "pl-9": row.depth >= 3,
                }}
              >
                <Event
                  event={row.event}
                  size={props.size}
                  expandMedia={props.expandMedia}
                  withinScope
                />
              </div>
            )}
          </For>
        </div>
      </Match>
      <Match when={props.settled}>
        <p class="c-secondary px-4 pb-4 text-caption">
          まだコメントはありません。
        </p>
      </Match>
      <Match when={true}>
        <p class="c-secondary px-4 pb-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  </section>
);

export default ArticleCommentsView;
