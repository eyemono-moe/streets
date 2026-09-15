import type { ContentToken } from "@streets/core/nostr/content";
import { profileLabel } from "@streets/core/nostr/profile";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
} from "solid-js";
import { useProfile } from "./use-profile";

const MentionName: Component<{ pubkey: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  return <span>@{profileLabel(profile(), props.pubkey)}</span>;
};

// 画像が読めないときに本文からショートコードまで消えないよう、文字へ戻す。
const Emoji: Component<{ shortcode: string; url: string }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={!broken()} fallback={`:${props.shortcode}:`}>
      <img
        src={props.url}
        alt={`:${props.shortcode}:`}
        title={`:${props.shortcode}:`}
        loading="lazy"
        class="inline-block h-6 w-auto object-contain"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

const shortRef = (raw: string) => {
  const entity = raw.replace(/^nostr:/, "");
  return entity.length > 12 ? `${entity.slice(0, 12)}…` : entity;
};

const Token: Component<{ token: ContentToken }> = (props) => (
  <Switch>
    <Match when={props.token.type === "text" && props.token}>
      {(token) => token().text}
    </Match>
    <Match when={props.token.type === "url" && props.token}>
      {(token) => (
        <a
          href={token().url}
          target="_blank"
          rel="noopener noreferrer"
          class="break-all text-link"
        >
          {token().url}
        </a>
      )}
    </Match>
    <Match when={props.token.type === "emoji" && props.token}>
      {(token) => <Emoji shortcode={token().shortcode} url={token().url} />}
    </Match>
    {/* 押した先の検索カラムがまだ無いので、リンクの見た目にしない。 */}
    <Match when={props.token.type === "hashtag" && props.token}>
      {(token) => token().raw}
    </Match>
    <Match when={props.token.type === "mention" && props.token}>
      {(token) => {
        const ref = token().ref;
        return ref.kind === "npub" || ref.kind === "nprofile" ? (
          <MentionName pubkey={ref.pubkey} />
        ) : (
          <span class="c-secondary" title={token().raw}>
            {shortRef(token().raw)}
          </span>
        );
      }}
    </Match>
  </Switch>
);

const NoteText: Component<{ tokens: ContentToken[]; class: string }> = (
  props,
) => (
  <p class={`break-anywhere whitespace-pre-wrap ${props.class}`}>
    <For each={props.tokens}>{(token) => <Token token={token} />}</For>
  </p>
);

export default NoteText;
