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
 * **押せる見た目にしてある。** 押しても今は何も起きないが、ユーザー詳細
 * カラム (#205) が入れば押してカラムを開く挙動にする予定であり、それまで
 * わざわざ見た目を分ける理由が無い (v0 の `EmbedUser` も同じ見た目)。
 */
const ProfileHover: ParentComponent<ProfileHoverProps> = (props) => (
  // `lazyMount`/`unmountOnExit` が無いと ark-ui 5.38.1 の `usePresence` は
  // `unmounted` を常に `false` にし、`HoverCard.Content` (= `ProfileCard`)
  // がホバー前から `hidden` 属性だけで隠れた状態で常時マウントされる
  // (1 カラムの初期表示 40 件 × 著者名/アイコンの 2 箇所で 80 個の
  // 非表示ツリーが `document.body` にぶら下がる。カラム数やレンダウィンドウ
  // の伸長を数えれば実際にはこれより増える —— 「最大」ではない)。
  // 仕様 7 節の「ホバーしたから増える通信は無い」——取得済みの著者では
  // 成り立つが、kind:0 をまだ持たない著者では `profile-requests.ts` の
  // `request()` が窓ごとに再要求するので厳密には成り立たない——を
  // DOM マウント数の面から補強するには、開くまでマウントしない
  // (`lazyMount`) だけでなく、閉じたら畳む (`unmountOnExit`) も要る ——
  // 前者だけだと一度開いたノートは以後ずっとマウントされたままになる。
  <HoverCard.Root lazyMount unmountOnExit>
    <Show
      when={props.asChild}
      fallback={
        // `HoverCard.Trigger` の実体は `<button>`。UnoCSS のリセット
        // (`@unocss/reset/tailwind-compat.css`) は `background-color:
        // transparent` の行がコメントアウトされているため、素の `<button>` は
        // UA 既定の `ButtonFace` 背景を保持したまま描かれる
        // (`renderers/Note.tsx` の展開ボタンで実測済みの罠と同じ) ——
        // `bg-transparent` が要る。
        //
        // 名前は本文の途中にも埋まるので `break-anywhere` と `max-w-full` で
        // 折り返させる。`<button>` の既定は中央寄せなので `text-left` で
        // 地の文に揃える。
        <HoverCard.Trigger
          data-testid="profile-hover-trigger"
          class="break-anywhere max-w-full cursor-pointer appearance-none bg-transparent text-left hover:underline"
        >
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
