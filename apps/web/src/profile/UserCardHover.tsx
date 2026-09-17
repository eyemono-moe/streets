import { HoverCard } from "@ark-ui/solid/hover-card";
import type { Component, JSX } from "solid-js";
import { Portal } from "solid-js/web";
import UserCard from "./UserCard";

/**
 * 押せる要素をそのままトリガーにするための、Ark UI から渡ってくる props。
 * 戻り値の要素型は Ark UI 側が `any` で持つので、そこに合わせる。
 */
export type HoverTrigger = (
  userProps?: JSX.IntrinsicElements["button"],
  // biome-ignore lint/suspicious/noExplicitAny: Ark UI の `asChild` の型に合わせる
) => JSX.HTMLAttributes<any>;

/**
 * 名前やアイコンに触れると名刺を出す。既にある押せる要素をそのまま
 * トリガーにする —— 包む要素を増やすと、行の高さやアイコンの sticky が崩れる。
 */
const UserCardHover: Component<{
  pubkey: string;
  trigger: (props: HoverTrigger) => JSX.Element;
}> = (props) => (
  // lazyMount/unmountOnExit が無いと、閉じている間も中身を作り続けて
  // 1 カラムぶんの DOM が何倍にもなる（投稿 1 件ごとに 2 か所ある）。
  <HoverCard.Root lazyMount unmountOnExit openDelay={400} closeDelay={120}>
    <HoverCard.Trigger asChild={props.trigger} />
    <Portal>
      <HoverCard.Positioner>
        <HoverCard.Content class="motion-pop overflow-hidden rounded-3 border border-primary bg-primary shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <UserCard pubkey={props.pubkey} />
        </HoverCard.Content>
      </HoverCard.Positioner>
    </Portal>
  </HoverCard.Root>
);

export default UserCardHover;
