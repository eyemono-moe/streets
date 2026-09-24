import { StreetSign } from "@streets/sign";
import { type Component, Show, createSignal } from "solid-js";
import { resizedImageUrl } from "../media/image-proxy";

/** プロフィール画像。画像が無い、または読み込めないときは pubkey 固有の標識を出す。 */
const Avatar: Component<{
  pubkey: string;
  picture?: string;
  class?: string;
  loading?: "eager" | "lazy";
}> = (props) => {
  const [broken, setBroken] = createSignal<string>();
  // 縮小した画像を読めなかった元。次は元の URL を直接読む。
  const [direct, setDirect] = createSignal<string>();
  const picture = () =>
    props.picture && props.picture !== broken() ? props.picture : undefined;
  // 元の画像は数千 px のこともあり、表示が小さくても元の大きさのまま画素を持つ。
  const source = (url: string) =>
    (url !== direct() && resizedImageUrl(url, "avatar")) || url;

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
            src={source(url())}
            alt=""
            loading={props.loading ?? "lazy"}
            decoding="async"
            class="size-full object-cover"
            onError={() => {
              if (source(url()) !== url()) setDirect(url());
              else setBroken(url());
            }}
          />
        )}
      </Show>
    </span>
  );
};

export default Avatar;
