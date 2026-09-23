import { type Component, For, Match, Show, Switch } from "solid-js";
import type { EventSize } from "./Event";
import LinkCardView from "./LinkCardView";
import { useLinkCard, useLinkCardMode } from "./link-card";

const LinkCardItem: Component<{
  url: string;
  mode: "compact" | "large";
  size: EventSize;
}> = (props) => {
  const query = useLinkCard(() => props.url);
  return (
    <Switch>
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

/** 本文の下に、リンクのカードを並べる。カラムの設定で切っていれば何も出さない。 */
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
