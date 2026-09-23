import { embedOf } from "@streets/core/view/embed";
import { type Component, For, Match, Show, Switch } from "solid-js";
import { XEmbed, YouTubeEmbed } from "./EmbedView";
import type { EventSize } from "./Event";
import LinkCardView from "./LinkCardView";
import { useLinkCard, useLinkCardMode } from "./link-card";

const LinkCardItem: Component<{
  url: string;
  mode: "compact" | "large";
  size: EventSize;
}> = (props) => {
  const query = useLinkCard(() => props.url);
  const embed = () => embedOf(props.url);
  const youtube = () => {
    const found = embed();
    return found?.kind === "youtube" ? found : undefined;
  };
  const x = () => {
    const found = embed();
    return found?.kind === "x" ? found : undefined;
  };
  return (
    <Switch>
      <Match when={youtube()}>
        {(video) => (
          <YouTubeEmbed
            id={video().id}
            start={video().start}
            title={query.data?.title}
          />
        )}
      </Match>
      <Match when={x()}>
        {(post) => (
          <XEmbed
            id={post().id}
            url={props.url}
            card={query.isPending ? undefined : (query.data ?? null)}
            mode={props.mode}
            size={props.size}
          />
        )}
      </Match>
      <Match when={query.isPending}>
        <LinkCardView url={props.url} mode={props.mode} size={props.size} />
      </Match>
      {/* 取れなかった・OGP が無いときは何も出さない。本文のリンクは残っている。 */}
      <Match when={query.data}>
        {(card) => (
          <LinkCardView
            url={props.url}
            card={card()}
            mode={props.mode}
            size={props.size}
          />
        )}
      </Match>
    </Switch>
  );
};

/**
 * 本文の下に、リンクのカードと埋め込み（YouTube・X）を並べる。カラムの設定で
 * 切っていれば何も出さない。
 */
const LinkCards: Component<{ urls: readonly string[]; size: EventSize }> = (
  props,
) => {
  const mode = useLinkCardMode();
  return (
    <Show when={mode !== "off" && mode}>
      {(shown) => (
        <For each={props.urls}>
          {(url) => (
            <LinkCardItem
              url={url}
              mode={shown() as "compact" | "large"}
              size={props.size}
            />
          )}
        </For>
      )}
    </Show>
  );
};

export default LinkCards;
