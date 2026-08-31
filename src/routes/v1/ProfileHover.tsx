import { HoverCard } from "@ark-ui/solid/hover-card";
import { type JSX, type ParentComponent, Show } from "solid-js";
import { Portal } from "solid-js/web";
import ProfileCard from "./ProfileCard";

export type ProfileHoverProps = {
  pubkey: string;
  onClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>;
  /**
   * トリガーを**既存の要素そのもの**にしたいときに渡す —— `Avatar` の枠は
   * `sticky top-0` で、別要素で包むと効かなくなる。
   */
  asChild?: (props: () => JSX.HTMLAttributes<HTMLElement>) => JSX.Element;
};

/**
 * 名前やアイコンにホバーするとプロフィールカードを出す。**押せる見た目に
 * してある** —— 今は何も起きないが、ユーザー詳細カラムが入れば開く予定。
 */
const ProfileHover: ParentComponent<ProfileHoverProps> = (props) => (
  // `lazyMount`/`unmountOnExit` が無いと ark-ui は開く前から `hidden` で
  // 隠れたまま常時マウントし続け、DOM が肥大化する。「ホバーで通信は
  // 増えない」のは取得済みの著者だけ (未取得だと窓ごとに再要求される) ので、
  // マウント数を抑えるため両方とも要る。
  <HoverCard.Root lazyMount unmountOnExit>
    <Show
      when={props.asChild}
      fallback={
        // `HoverCard.Trigger` は `<button>` 実体。UnoCSS のリセットは
        // `background-color: transparent` がコメントアウトされているため
        // UA 既定の背景が残る —— `bg-transparent` が要る。名前は本文途中に
        // 埋まるので `break-anywhere`/`max-w-full`、`text-left` で地の文に揃える。
        <HoverCard.Trigger
          data-testid="profile-hover-trigger"
          class="break-anywhere max-w-full cursor-pointer appearance-none bg-transparent text-left hover:underline"
          onClick={props.onClick}
        >
          {props.children}
        </HoverCard.Trigger>
      }
    >
      {(asChild) => (
        <HoverCard.Trigger asChild={asChild()} onClick={props.onClick} />
      )}
    </Show>
    <Portal>
      <HoverCard.Positioner>
        <HoverCard.Content class="b-1 max-h-[min(calc(100vh-32px),360px)] min-h-0 max-w-[min(calc(100vw-32px),360px)] overflow-hidden rounded-2 bg-primary shadow-lg">
          <ProfileCard pubkey={props.pubkey} />
        </HoverCard.Content>
      </HoverCard.Positioner>
    </Portal>
  </HoverCard.Root>
);

export default ProfileHover;
