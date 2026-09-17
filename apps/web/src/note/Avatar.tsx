import { buildUserColumn } from "@streets/core/deck/column-presets";
import { type Component, Show, createSignal } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

// 枠は画像の有無にかかわらず描く。プロフィールは後から届くので、画像待ちで行がずれないようにする。
/** `tiny` は、通知の 1 行に何人も並べるときの大きさ。 */
export type AvatarSize = EventSize | "tiny";

const Avatar: Component<{ pubkey: string; size: AvatarSize }> = (props) => {
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
              "shrink-0 overflow-hidden bg-secondary p-0 enabled:cursor-pointer",
            onClick: () =>
              dispatch({
                type: "stack/open",
                column: buildUserColumn(props.pubkey),
              }),
          })}
          classList={{
            // 角の丸みは大きさで変える。固定の class と classList に両方書くと、どちらが勝つかが CSS の並びで決まってしまう。
            "size-10 rounded-2": props.size === "normal",
            "size-8 rounded-2": props.size === "compact",
            "size-5 rounded-1.5": props.size === "tiny",
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
