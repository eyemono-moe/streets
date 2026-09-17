import { buildUserColumn } from "@streets/core/deck/column-presets";
import { type Component, Show, createSignal } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

// 枠は画像の有無にかかわらず描く。プロフィールは後から届くので、画像待ちで行がずれないようにする。
const Avatar: Component<{ pubkey: string; size: EventSize }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const dispatch = useDispatch();
  const [broken, setBroken] = createSignal<string>();
  const picture = () => {
    const url = profile()?.picture;
    return url !== broken() ? url : undefined;
  };

  return (
    <UserCardHover
      pubkey={props.pubkey}
      trigger={(triggerProps) => (
        <button
          {...triggerProps({
            type: "button",
            "aria-label": "この人のカラムを開く",
            class:
              "shrink-0 overflow-hidden rounded-2 bg-secondary p-0 enabled:cursor-pointer",
            onClick: () =>
              dispatch({
                type: "stack/open",
                column: buildUserColumn(props.pubkey),
              }),
          })}
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
        </button>
      )}
    />
  );
};

export default Avatar;
