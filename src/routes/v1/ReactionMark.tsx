import { Match, Switch, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { ReactionContent } from "../../core/nostr/reaction";

/**
 * 反応内容そのもの。kind:7 の見出しと `ReactionList` が同じ見た目を要るので
 * 切り出す。`content` を先に取り出すのは `<Match>` 内での TS 絞り込みのため。
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

export default ReactionMark;
