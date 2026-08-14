import { Match, Show, Switch, createSignal } from "solid-js";
import type { Component } from "solid-js";
import {
  type ReactionContent,
  parseReaction,
} from "../../../core/nostr/reaction";
import { useRender } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import EventView from "../EventView";
import Profile from "../Profile";

/**
 * 見出しに出す反応内容そのもの (仕様 3.1 節の表)。
 *
 * `content` を先に取り出してから分岐するのは、`<Match when={...}>` の中で
 * `props.content.type` を毎回書き直すと TypeScript の絞り込みが効かず、
 * 分岐の中で再度 type を確かめる冗長なコードになるため。
 */
const ReactionMark: Component<{ content: ReactionContent }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const emoji = () =>
    props.content.type === "emoji" ? props.content : undefined;
  const text = () =>
    props.content.type === "text" ? props.content : undefined;

  return (
    <Switch>
      <Match when={props.content.type === "like"}>
        <span
          data-testid="reaction-like"
          class="i-material-symbols:favorite-rounded c-accent-5 aspect-square h-5 w-auto shrink-0"
        />
      </Match>
      {/*
        絵文字の画像が落ちたらショートコードのテキストへ戻す —— 画像が 404 でも
        「何のリアクションか」が消えない (`NoteContent` の絵文字と同じ判断)。
      */}
      <Match when={emoji() && !broken()}>
        <img
          data-testid="reaction-emoji"
          src={emoji()?.url}
          alt={emoji()?.name}
          title={emoji()?.name}
          class="inline-block h-5 w-auto shrink-0"
          onError={() => setBroken(true)}
        />
      </Match>
      <Match when={emoji() && broken()}>
        <span class="h-5 shrink-0 truncate leading-5">{`:${emoji()?.name}:`}</span>
      </Match>
      <Match when={text()}>
        <span class="h-5 truncate leading-5">{text()?.content}</span>
      </Match>
    </Switch>
  );
};

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
