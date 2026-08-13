import { type Component, Show } from "solid-js";
import { useRender } from "../../core/view/render-context";
import { useProfileData } from "./profile-data";

export type AvatarProps = {
  pubkey: string;
  size: "full" | "compact";
};

/**
 * 骨格の左列 (spec 3 節)。**枠は常に描く** —— プロフィールが未取得でも
 * `w-10`/`w-8` の寸法は最初から確定している。カラムは数十件のノートを
 * まとめて描いてからプロフィールをバッチで取得する
 * (`ProfileRequests` の 200ms 窓) ので、枠が画像の到着を待って現れると、
 * プロフィールが 1 件ずつ届くたびに以降の行が横にずれる。
 *
 * `sticky top-0` —— 本文が `MAX_CONTENT_HEIGHT` 近くまで伸びてスクロール
 * しても、誰の投稿かを見失わない (spec 3 節)。
 */
const Avatar: Component<AvatarProps> = (props) => {
  const ctx = useRender();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);

  return (
    <div
      data-testid="avatar"
      class="sticky top-0 aspect-square shrink-0 overflow-hidden rounded bg-secondary"
      classList={{
        "w-10": props.size === "full",
        "w-8": props.size === "compact",
      }}
    >
      <Show when={profile()?.picture}>
        {(picture) => (
          <img
            src={picture()}
            alt=""
            loading="lazy"
            class="h-full w-full object-cover"
          />
        )}
      </Show>
    </div>
  );
};

export default Avatar;
