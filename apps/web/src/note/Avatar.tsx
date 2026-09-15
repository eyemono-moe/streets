import { type Component, Show, createSignal } from "solid-js";
import { useProfile } from "./use-profile";

// 枠は画像の有無にかかわらず描く。プロフィールは後から届くので、画像待ちで行がずれないようにする。
const Avatar: Component<{ pubkey: string; size: "note" | "quote" }> = (
  props,
) => {
  const profile = useProfile(() => props.pubkey);
  const [broken, setBroken] = createSignal<string>();
  const picture = () => {
    const url = profile()?.picture;
    return url !== broken() ? url : undefined;
  };

  return (
    <div
      class="shrink-0 overflow-hidden bg-secondary"
      classList={{
        "size-10 rounded-2": props.size === "note",
        "size-4 rounded-1": props.size === "quote",
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
