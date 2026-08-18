import { HoverCard } from "@ark-ui/solid/hover-card";
import { type JSX, type ParentComponent, Show } from "solid-js";
import { Portal } from "solid-js/web";
import ProfileCard from "./ProfileCard";

export type ProfileHoverProps = {
  pubkey: string;
  /**
   * トリガーを**既存の要素そのもの**にしたいときに渡す。`Avatar` の枠は
   * `sticky top-0` で、包む要素を挟むと `sticky` はその小さな包みの中で
   * 動くことになり効かなくなる (仕様 5.1 節)。
   */
  asChild?: (props: () => JSX.HTMLAttributes<HTMLElement>) => JSX.Element;
};

/**
 * 名前やアイコンにホバーするとプロフィールカードを出す (仕様 5 節)。
 *
 * **トリガーは押せそうに見せない** —— `cursor-pointer` も
 * `hover:underline` も付けない。押しても何も起きないため (ADR-0026)。
 * ユーザー詳細カラム (#205) が入った時点で両方を足してクリックを繋ぐ。
 */
const ProfileHover: ParentComponent<ProfileHoverProps> = (props) => (
  // `lazyMount`/`unmountOnExit` が無いと ark-ui 5.38.1 の `usePresence` は
  // `unmounted` を常に `false` にし、`HoverCard.Content` (= `ProfileCard`)
  // がホバー前から `hidden` 属性だけで隠れた状態で常時マウントされる
  // (レビューで実測: 最大 80 個の非表示ツリーが `document.body` にぶら下がる)。
  // 仕様 7 節の「ホバーしたから増える通信は無い」を満たすには、開くまで
  // マウントしない (`lazyMount`) だけでなく、閉じたら畳む
  // (`unmountOnExit`) も要る —— 前者だけだと一度開いたノートは以後ずっと
  // マウントされたままになる。
  <HoverCard.Root lazyMount unmountOnExit>
    <Show
      when={props.asChild}
      fallback={
        <HoverCard.Trigger data-testid="profile-hover-trigger">
          {props.children}
        </HoverCard.Trigger>
      }
    >
      {(asChild) => <HoverCard.Trigger asChild={asChild()} />}
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
