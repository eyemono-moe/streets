import { type Component, Show, createSignal } from "solid-js";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

// 枠は画像の有無にかかわらず描く。プロフィールは後から届くので、画像待ちで行がずれないようにする。
const Avatar: Component<{ pubkey: string; size: EventSize }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const [broken, setBroken] = createSignal<string>();
  const picture = () => {
    const url = profile()?.picture;
    return url !== broken() ? url : undefined;
  };

  return (
    <div
      class="shrink-0 overflow-hidden rounded-2 bg-secondary"
      classList={{
        "size-10": props.size === "normal",
        "size-8": props.size === "compact",
      }}
    >
      <Show when={picture()}>
        {(url) => (
          <img
            src={url()}
            alt=""
            loading="lazy"
            class="size-full object-cover"
            onError={() => setBroken(url())}
          />
        )}
      </Show>
    </div>
  );
};

export default Avatar;
