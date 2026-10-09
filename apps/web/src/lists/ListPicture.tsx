import { type Component, Show } from "solid-js";

/** リストの画像。無ければ、リストの種類の印を出す。 */
const ListPicture: Component<{
  url?: string;
  class: string;
  /** 画像が無いときの印。既定は人の集まり。 */
  icon?: string;
}> = (props) => (
  <Show
    when={props.url}
    fallback={
      <span
        class={`c-secondary grid shrink-0 place-items-center bg-secondary ${props.class}`}
        aria-hidden="true"
      >
        <span
          class={`${props.icon ?? "i-material-symbols:group-outline-rounded"} size-1/2`}
        />
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

export default ListPicture;
