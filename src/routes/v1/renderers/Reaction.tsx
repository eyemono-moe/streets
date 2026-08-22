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
        <article
          data-testid="reaction"
          // `group/event` + `group-[_]/event:p-0`: `NoteFull`/`RepostFull`
          // と同じ手筋 (`Note.tsx` 参照) —— 対象を `full` で描く (spec 3
          // 節) ので、自分の padding は祖先に `group/event` があるときだけ
          // 0 に潰す。`group/event` を付けるのは、リアクションの対象が
          // 別のリポスト/リアクションであってもそちらの padding が潰れる
          // ようにするため。
          class="group/event p-3 text-body group-[_]/event:p-0"
        >
          <p
            data-testid="reacted-by"
            class="c-secondary flex items-center gap-1 text-caption"
          >
            <ReactionMark content={reaction().content} />
            {/*
              見出しの名前は太字・1 行に丸める (spec 3.1 節)。`<Profile>`
              自体は変えず外側で `min-w-0 truncate` を足す (`Repost.tsx` と
              同じ手筋)。
            */}
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
