import { Show } from "solid-js";
import type { Component } from "solid-js";
import { parseReaction } from "../../../core/nostr/reaction";
import { useRender } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import EventView from "../EventView";
import Profile from "../Profile";
import ReactionMark from "../ReactionMark";

/**
 * kind:7 の詳細表示 (仕様 3 節)。見出し 1 行と、対象イベントの**完全な**
 * 描画。対象を `compact` にしないのは、リアクションが見せたいのは
 * 「そのイベントそのもの」だからで、省略形にする理由が無い。
 *
 * 対象が分からない kind:7 (e タグが無い) は**何も描かない** —— 見出しだけ
 * 出しても「誰かが何かにリアクションした」以上の意味が無い。
 */
export const ReactionFull: Component<EventBodyProps> = (props) => {
  const ctx = useRender();
  const parsed = () => parseReaction(props.event);

  return (
    <Show when={parsed()}>
      {(reaction) => (
        <article data-testid="reaction" class="pt-1 pr-2 pb-1 pl-1 text-body">
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1 text-caption"
          >
            <ReactionMark content={reaction().content} />
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
            />
            <span class="shrink-0">がリアクション</span>
          </p>
          <EventView id={reaction().targetId} variant="full" />
        </article>
      )}
    </Show>
  );
};

/**
 * kind:7 の小型表示。見出しだけで対象は描かない —— `NoteCompact` と同じ
 * 理由で、compact は関連イベントを一切要求しない。
 */
export const ReactionCompact: Component<EventBodyProps> = (props) => {
  const ctx = useRender();
  const parsed = () => parseReaction(props.event);

  return (
    <Show when={parsed()}>
      {(reaction) => (
        <article data-testid="reaction" class="text-caption">
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1"
          >
            <ReactionMark content={reaction().content} />
            <Profile
              pubkey={props.event.pubkey}
              store={ctx.store}
              requests={ctx.profiles}
            />
            <span class="shrink-0">がリアクション</span>
          </p>
        </article>
      )}
    </Show>
  );
};
