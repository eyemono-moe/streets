import { type Component, Show } from "solid-js";

/** チャンネルの画像。無ければ、チャットの印を出す。 */
const ChannelPicture: Component<{ url?: string; class: string }> = (props) => (
  <Show
    when={props.url}
    fallback={
      <span
        class={`c-secondary grid shrink-0 place-items-center bg-secondary ${props.class}`}
        aria-hidden="true"
      >
        <span class="i-material-symbols:forum-outline-rounded size-1/2" />
      </span>
    }
  >
    {(url) => (
      <img
        src={url()}
        alt=""
        class={`shrink-0 bg-secondary object-cover ${props.class}`}
        loading="lazy"
        decoding="async"
      />
    )}
  </Show>
);

export default ChannelPicture;
