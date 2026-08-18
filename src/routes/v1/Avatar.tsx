import { type Component, type JSX, Show } from "solid-js";
import { useRender } from "../../core/view/render-context";
import ProfileHover from "./ProfileHover";
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
 *
 * ホバーカードのトリガーは `asChild` でこの枠そのものに合流させる
 * (仕様 5.1 節)。トリガーが枠を包む別要素になると、`sticky` はその
 * 小さな包みの中でしか動けず効かなくなる。
 */
const Avatar: Component<AvatarProps> = (props) => {
  const ctx = useRender();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);

  return (
    <ProfileHover
      pubkey={props.pubkey}
      asChild={(triggerProps) => (
        <div
          // `triggerProps()` は `JSX.HTMLAttributes<HTMLElement>` (ark-ui
          // 5.38.1 の `ParentProps<T>` を素直に写した型、`ProfileHover.tsx`
          // 参照)。`ref` が `HTMLElement` 型のままだと `<div>` の
          // `HTMLDivElement` 用 `ref` と構造的に噛み合わない —— ここは
          // ark-ui が `<button>` を渡すつもりで持っている一般形を、実際に
          // `<div>` へ合流させる側の橋渡しなので、ここでだけ絞る。
          {...(triggerProps() as unknown as JSX.HTMLAttributes<HTMLDivElement>)}
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
      )}
    />
  );
};

export default Avatar;
