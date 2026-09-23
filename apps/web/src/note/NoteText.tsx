import {
  buildHashtagColumn,
  buildThreadColumn,
} from "@streets/core/deck/column-presets";
import type { ContentToken } from "@streets/core/nostr/content";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { useDispatch } from "../ui-events";
import UserLink from "./UserLink";

// 画像が読めないときに本文からショートコードまで消えないよう、文字へ戻す。
const Emoji: Component<{ shortcode: string; url: string; class?: string }> = (
  props,
) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={!broken()} fallback={`:${props.shortcode}:`}>
      <img
        src={props.url}
        alt={`:${props.shortcode}:`}
        title={`:${props.shortcode}:`}
        loading="lazy"
        class={`inline-block w-auto object-contain ${props.class ?? "h-6"}`}
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

const shortRef = (raw: string) => {
  const entity = raw.replace(/^nostr:/, "");
  return entity.length > 12 ? `${entity.slice(0, 12)}…` : entity;
};

const Token: Component<{
  token: ContentToken;
  emojiClass?: string;
  interactive?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <Switch>
      <Match when={props.token.type === "text" && props.token}>
        {(token) => token().text}
      </Match>
      <Match when={props.token.type === "url" && props.token}>
        {(token) =>
          props.interactive === false ? (
            token().url
          ) : (
            <a
              href={token().url}
              target="_blank"
              rel="noopener noreferrer"
              class="break-all text-link"
            >
              {token().url}
            </a>
          )
        }
      </Match>
      <Match when={props.token.type === "emoji" && props.token}>
        {(token) => (
          <Emoji
            shortcode={token().shortcode}
            url={token().url}
            class={props.emojiClass}
          />
        )}
      </Match>
      <Match when={props.token.type === "hashtag" && props.token}>
        {(token) => {
          if (props.interactive === false) return token().raw;
          return (
            <button
              type="button"
              class="bg-transparent p-0 text-left text-link enabled:cursor-pointer enabled:hover:underline"
              onClick={() => {
                const column = buildHashtagColumn(token().tag);
                if (column) dispatch({ type: "stack/open", column });
              }}
            >
              {token().raw}
            </button>
          );
        }}
      </Match>
      <Match when={props.token.type === "mention" && props.token}>
        {(token) => {
          if (props.interactive === false) return token().raw;
          const ref = token().ref;
          if (ref.kind === "npub" || ref.kind === "nprofile") {
            return <UserLink pubkey={ref.pubkey} mention class="text-link" />;
          }
          if (ref.kind === "note" || ref.kind === "nevent") {
            return (
              <button
                type="button"
                class="bg-transparent p-0 text-left text-link enabled:cursor-pointer enabled:hover:underline"
                title={token().raw}
                onClick={() =>
                  dispatch({
                    type: "stack/open",
                    column: buildThreadColumn(ref.id),
                  })
                }
              >
                {shortRef(token().raw)}
              </button>
            );
          }
          return (
            <span class="c-secondary" title={token().raw}>
              {shortRef(token().raw)}
            </span>
          );
        }}
      </Match>
    </Switch>
  );
};

export const ContentTokens: Component<{
  tokens: ContentToken[];
  emojiClass?: string;
  interactive?: boolean;
}> = (props) => (
  <For each={props.tokens}>
    {(token) => (
      <Token
        token={token}
        emojiClass={props.emojiClass}
        interactive={props.interactive}
      />
    )}
  </For>
);

const NoteText: Component<{
  tokens: ContentToken[];
  class: string;
  classList?: Record<string, boolean>;
  emojiClass?: string;
}> = (props) => (
  <p
    // 重ねたカラムでも Drawer のスワイプより文字の選択を優先する。
    data-no-drag=""
    class={`break-anywhere select-text whitespace-pre-wrap ${props.class}`}
    classList={props.classList}
  >
    <ContentTokens tokens={props.tokens} emojiClass={props.emojiClass} />
  </p>
);

export default NoteText;
