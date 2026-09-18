import { buildUserColumn } from "@streets/core/deck/column-presets";
import { StreetSign } from "@streets/sign";
import { type Component, Show, createSignal } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

/** `tiny` は、通知の 1 行に何人も並べるときの大きさ。 */
export type AvatarSize = EventSize | "tiny";

const sizeClass = (size: AvatarSize) => ({
  // 角の丸みは大きさで変える。固定の class と classList に両方書くと、どちらが勝つかが CSS の並びで決まってしまう。
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
  const [broken, setBroken] = createSignal<string>();
  const picture = () => {
    const url = profile()?.picture;
    return url !== broken() ? url : undefined;
  };

  // 枠は画像の有無にかかわらず描く。プロフィールは後から届くので、画像待ちで行がずれないようにする。
  const image = () => (
    <Show
      when={picture()}
      fallback={
        <StreetSign name={props.pubkey} classList={sizeClass(props.size)} />
      }
    >
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
  );

  return (
    <Show
      when={!props.static}
      fallback={
        <span
          class="block shrink-0 overflow-hidden bg-secondary"
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
