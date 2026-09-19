import { buildUserColumn } from "@streets/core/deck/column-presets";
import { type Component, Show } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import AvatarImage from "../ui/Avatar";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

/** `tiny` は、通知の 1 行に何人も並べるときの大きさ。 */
export type AvatarSize = EventSize | "tiny";

const sizeClass = (size: AvatarSize) => ({
  "size-10 rounded-2": size === "normal",
  "size-8 rounded-2": size === "compact",
  "size-5 rounded-1.5": size === "tiny",
});

/**
 * その人のアイコン。触れると名刺、押すとその人のカラムを重ねる。
 * `static` はほかのボタンの中に置くとき（アカウントメニューなど）に使う ——
 * ボタンの中にボタンを入れると、押したときに両方が動く。
 */
const Avatar: Component<{
  pubkey: string;
  size: AvatarSize;
  static?: boolean;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const dispatch = useDispatch();
  const image = () => (
    <AvatarImage
      pubkey={props.pubkey}
      picture={profile()?.picture}
      class="size-full"
    />
  );

  return (
    <Show
      when={!props.static}
      fallback={
        <span
          class="block shrink-0 overflow-hidden"
          classList={sizeClass(props.size)}
        >
          {image()}
        </span>
      }
    >
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
            classList={sizeClass(props.size)}
          >
            {image()}
          </button>
        )}
      />
    </Show>
  );
};

export default Avatar;
