import { type Component, type JSX, Show } from "solid-js";
import { useRender } from "../../core/view/render-context";
import ProfileHover from "./ProfileHover";
import { useOptionalColumnNavigation } from "./column-navigation";
import { useProfileData } from "./profile-data";

export type AvatarProps = {
  pubkey: string;
  size: "full" | "compact";
};

/**
 * 骨格の左列。**枠は常に描く** —— プロフィールはバッチ取得なので画像待ちで
 * 現れると行がずれる。`asChild` で枠自身をトリガーにする —— 別要素で包むと `sticky` が効かない。
 */
const Avatar: Component<AvatarProps> = (props) => {
  const ctx = useRender();
  const navigation = useOptionalColumnNavigation();
  const profile = useProfileData(() => props.pubkey, ctx.store, ctx.profiles);

  return (
    <ProfileHover
      pubkey={props.pubkey}
      onClick={(event) => {
        if (!navigation) return;
        event.stopPropagation();
        navigation.openUser(props.pubkey);
      }}
      asChild={(triggerProps) => (
        <div
          // `triggerProps()` の型は ark-ui の `ParentProps<T>` を写した
          // 一般形で、`ref` が `HTMLElement` のままだと `<div>` の `ref` と
          // 構造的に噛み合わない —— ここだけ `<div>` 用に絞るキャスト。
          {...(triggerProps() as unknown as JSX.HTMLAttributes<HTMLDivElement>)}
          data-testid="avatar"
          class="sticky top-0 aspect-square shrink-0 overflow-hidden rounded bg-secondary"
          classList={{
            "h-10 w-10": props.size === "full",
            "h-8 w-8": props.size === "compact",
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
