import { Show } from "solid-js";
import type { Component } from "solid-js";
import { parseReaction } from "../../../core/nostr/reaction";
import { useRender } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import EventView from "../EventView";
import Profile from "../Profile";
import ReactionMark from "../ReactionMark";

/**
 * kind:7 の詳細表示。「そのイベントそのもの」を見せたいので対象は
 * `compact` にせず完全に描く。対象不明 (e タグ無し) では何も描かない ——
 * 見出しだけでは「誰かが何かにリアクションした」以上の意味が無い。
 */
export const ReactionFull: Component<EventBodyProps> = (props) => {
  const ctx = useRender();
  const parsed = () => parseReaction(props.event);

  return (
    <Show when={parsed()}>
      {(reaction) => (
        <article
          data-testid="reaction"
          // 対象を `full` で描くので、祖先が `group/event` を持つときだけ
          // 自分の padding を 0 に潰す (対象の入れ子でも潰れるように)。
          class="group/event p-3 text-body group-[_]/event:p-0"
        >
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1 text-caption"
          >
            <ReactionMark content={reaction().content} />
            {/* 太字・1 行に丸める。`<Profile>` は変えず外側に min-w-0 truncate を足す。 */}
            <span
              data-testid="reacted-by-name"
              class="min-w-0 truncate font-700"
            >
              <Profile
                pubkey={props.event.pubkey}
                store={ctx.store}
                requests={ctx.profiles}
              />
            </span>
            <span class="shrink-0">がリアクション</span>
          </p>
          <EventView id={reaction().targetId} variant="full" hideActions />
        </article>
      )}
    </Show>
  );
};

/** kind:7 の小型表示。見出しだけで対象は描かない (compact は関連イベントを要求しない)。 */
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
            <span data-testid="reacted-by-name" class="font-700">
              <Profile
                pubkey={props.event.pubkey}
                store={ctx.store}
                requests={ctx.profiles}
              />
            </span>
            <span class="shrink-0">がリアクション</span>
          </p>
        </article>
      )}
    </Show>
  );
};
