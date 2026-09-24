import { StreetSign } from "@streets/sign";
import { type Component, Show, createSignal } from "solid-js";

/** プロフィール画像。画像が無い、または読み込めないときは pubkey 固有の標識を出す。 */
const Avatar: Component<{
  pubkey: string;
  picture?: string;
  class?: string;
  loading?: "eager" | "lazy";
}> = (props) => {
  const [broken, setBroken] = createSignal<string>();
  const picture = () =>
    props.picture && props.picture !== broken() ? props.picture : undefined;

  return (
    <span
      class={`block shrink-0 overflow-hidden bg-secondary ${props.class ?? ""}`}
    >
      <Show
        when={picture()}
        fallback={
          <StreetSign
            name={props.pubkey}
            class="size-full object-cover"
            aria-hidden="true"
          />
        }
      >
        {(url) => (
          <img
            src={url()}
            alt=""
            loading={props.loading ?? "lazy"}
            decoding="async"
            class="size-full object-cover"
            onError={() => setBroken(url())}
          />
        )}
      </Show>
    </span>
  );
};

export default Avatar;
