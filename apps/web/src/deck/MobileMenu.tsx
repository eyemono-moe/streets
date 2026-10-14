import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import {
  type Component,
  type JSX,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import Avatar from "../note/Avatar";
import { ProfileName, ProfileText } from "../note/Name";
import { useProfileDetails } from "../note/use-profile";
import { useUserStatuses } from "../status/use-user-statuses";
import { type UiEvent, useDispatch } from "../ui-events";
import { Portal } from "../ui/Portal";
import { FeedbackDialog, feedbackHref } from "./FeedbackDialog";
import { trackMenuDrag } from "./menu-drag";

/** 開く・閉じる動きの長さ。閉じる動きを待ってから Dialog を閉じるのにも使う。 */
const MENU_MOTION_MS = 180;
const MENU_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const Row: Component<{
  icon: string;
  label: JSX.Element;
  onClick: () => void;
  muted?: boolean;
}> = (props) => (
  <button
    type="button"
    class="flex min-h-12 w-full cursor-pointer items-center gap-4 bg-transparent px-5 py-2 text-left text-body outline-none hover:bg-secondary focus-visible:bg-secondary"
    classList={{ "c-secondary": props.muted, "c-primary": !props.muted }}
    onClick={() => props.onClick()}
  >
    <span class={`${props.icon} size-6 shrink-0`} aria-hidden="true" />
    <span class="min-w-0 flex-1">{props.label}</span>
  </button>
);

/**
 * 狭い画面で左から出る、アプリ全体のメニュー。検索・カラムの追加・設定などの入口を集める。
 * 上のバーの自分のアイコンか、画面を右へ払うと開く。払っている間は指に付いて出てきて、
 * 開いた後も左へ払うと指に付いて戻る。
 */
const MobileMenu: Component<{
  /** ログインしていなければ undefined。 */
  pubkey: string | undefined;
  open: boolean;
  /** 画面を右へ払って引き出している途中なら、出ている割合（0〜1）。 */
  pulling: number | undefined;
  onLogout: () => void;
  /** フィードバックの送り先。省くと環境の設定、null なら送り先なし（導線を出さない）。 */
  feedbackUrl?: string | null;
  /**
   * メニューの出ている割合（0〜1）、動かさずにその割合へ置くか（指で動かしている途中など）、
   * 出ているか（閉じる動きの途中も含む）。後ろの画面の奥行きをこれに合わせる。
   */
  onShown?: (progress: number, instant: boolean, present: boolean) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const statuses = useUserStatuses(() => props.pubkey);
  const current = () => statuses().find((status) => status.type === "general");
  const feedback = () => feedbackHref(props.feedbackUrl);
  const [feedbackOpen, setFeedbackOpen] = createSignal(false);
  // 開いた後、左へ押し戻している途中なら、出ている割合。
  const [pushing, setPushing] = createSignal<number>();
  const dragging = () => pushing() ?? props.pulling;
  // 見えている割合と、そこへ動かすか（指で動かしている間と、出し始めの 1 枚は動かさない）。
  const [shown, setShown] = createSignal(0);
  const [instant, setInstant] = createSignal(true);
  // 閉じる動きを終えるまでは、Ark UI の Dialog を開いたままにする。
  const [present, setPresent] = createSignal(false);
  let content: HTMLDivElement | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let entering: number | undefined;
  onCleanup(() => {
    clearTimeout(closing);
    if (entering !== undefined) cancelAnimationFrame(entering);
  });
  // 動きはキーフレームではなく、値を書いたトランジションで付ける。iOS の WebKit は
  // var() を含むキーフレームを合成の層だけで動かせず、メインスレッドが忙しいと指を
  // 離した後の動きが飛ぶ。トランジションなら、指を離した位置からそのまま続く。
  createEffect(() => {
    const drag = dragging();
    const open = props.open;
    clearTimeout(closing);
    if (entering !== undefined) cancelAnimationFrame(entering);
    entering = undefined;
    if (drag !== undefined) {
      setPresent(true);
      setInstant(true);
      setShown(drag);
      return;
    }
    if (open) {
      if (untrack(present)) {
        setInstant(false);
        setShown(1);
        return;
      }
      // 隠れた位置で 1 度描いてから動かす。同じフレームで変えると、動かずに現れる。
      setPresent(true);
      setInstant(true);
      setShown(0);
      entering = requestAnimationFrame(() => {
        entering = requestAnimationFrame(() => {
          entering = undefined;
          setInstant(false);
          setShown(1);
        });
      });
      return;
    }
    if (!untrack(present)) return;
    setInstant(false);
    setShown(0);
    closing = setTimeout(() => setPresent(false), MENU_MOTION_MS);
  });
  createEffect(() => props.onShown?.(shown(), instant(), present()));
  const offset = (progress: number) => `${(progress - 1) * 100}%`;
  const transition = (property: string) =>
    instant() ? "none" : `${property} ${MENU_MOTION_MS}ms ${MENU_EASING}`;

  // 選んだものは、メニューが閉じきってから開く。閉じたメニューは自分のアイコンへ焦点を
  // 戻すので、先に開いたダイアログは焦点が外へ出たとみなして閉じてしまう。Ark UI の
  // Dialog は焦点を戻すかを開いたときに決めるので、選んだときに戻さないよう切り替えられない。
  let afterClose: (() => void) | undefined;
  const choose = (event: UiEvent | (() => void)) => {
    afterClose = typeof event === "function" ? event : () => dispatch(event);
    dispatch({ type: "deck/close-menu" });
  };
  const details = useProfileDetails(() => props.pubkey);
  const profile = () => details()?.profile;

  const trackPush = (el: HTMLElement) => {
    const stop = trackMenuDrag(el, {
      toward: "left",
      accepts: () => props.open,
      move: setPushing,
      end: (open) => {
        setPushing(undefined);
        if (!open) dispatch({ type: "deck/close-menu" });
      },
    });
    onCleanup(stop);
  };

  return (
    <>
      <ArkDialog.Root
        open={present()}
        onOpenChange={(details) => {
          if (!details.open) dispatch({ type: "deck/close-menu" });
        }}
        // 開いたら、行ではなくメニュー全体に焦点を置く。指で引き出している途中に、先頭の行に
        // 焦点の枠が出て押したように見えるのを避ける。
        initialFocusEl={() => content ?? null}
        onExitComplete={() => {
          const run = afterClose;
          afterClose = undefined;
          run?.();
        }}
        // 閉じても外さない。開くたびに作り直すと、払い始めた指の下で中身を組み立てることになり、
        // 短く払ったときに動きが飛ぶ。メニューは 1 つだけなので、残しても DOM は増えない。
        // 背後の body を止めない。iOS では止めるときに body を position: fixed にして
        // 画面全体を組み直す。アプリの body は元から流れない。
        preventScroll={false}
        lazyMount
      >
        <Portal>
          <ArkDialog.Backdrop
            class="fixed inset-0 bg-ui-950/40"
            style={{
              opacity: shown(),
              transition: transition("opacity"),
              "will-change": "opacity",
            }}
          />
          <ArkDialog.Positioner
            ref={trackPush}
            class="fixed inset-0 flex justify-start"
          >
            <ArkDialog.Content
              ref={content}
              tabIndex={-1}
              aria-label="メニュー"
              class="c-primary flex h-full w-[min(300px,85vw)] flex-col bg-primary pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-lg outline-none"
              style={{
                transform: `translate3d(${offset(shown())},0,0)`,
                transition: transition("transform"),
                "will-change": "transform",
              }}
            >
              <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <Show
                  when={props.pubkey}
                  fallback={
                    <div class="py-2">
                      <Row
                        icon="i-material-symbols:login-rounded"
                        label="ログイン"
                        onClick={() => choose({ type: "deck/login" })}
                      />
                    </div>
                  }
                >
                  {(pubkey) => (
                    <div class="flex flex-col gap-3 px-5 pt-5 pb-3">
                      <Avatar pubkey={pubkey()} size="normal" static />
                      <span class="flex min-w-0 flex-col">
                        <span class="min-w-0 truncate font-700 text-body">
                          <ProfileName
                            pubkey={pubkey()}
                            profile={profile()}
                            tags={details()?.tags}
                          />
                        </span>
                        {/* display_name が無いと太字側が name に落ちるので、同じ文字列を 2 回並べない。 */}
                        <Show when={profile()?.displayName && profile()?.name}>
                          {(name) => (
                            <span class="c-secondary min-w-0 truncate text-caption">
                              @
                              <ProfileText
                                text={name()}
                                tags={details()?.tags}
                              />
                            </span>
                          )}
                        </Show>
                      </span>
                      <button
                        type="button"
                        class="c-secondary flex max-w-full cursor-pointer items-center gap-2 self-start rounded-full bg-secondary px-3 py-1.5 text-caption"
                        onClick={() => choose({ type: "status/edit" })}
                      >
                        <span
                          class="i-material-symbols:add-reaction-outline-rounded size-4 shrink-0"
                          aria-hidden="true"
                        />
                        {/* 切れても、何を出しているかは分かる。 */}
                        <span class="min-w-0 truncate">
                          {current()?.content || "ステータスを設定"}
                        </span>
                      </button>
                    </div>
                  )}
                </Show>
                <hr class="my-1 border-primary border-t" />
                <nav aria-label="メニュー" class="py-1">
                  <Row
                    icon="i-material-symbols:search-rounded"
                    label="検索"
                    onClick={() =>
                      choose({ type: "deck/open-panel", panel: "search" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:add-rounded"
                    label="カラムを追加"
                    onClick={() =>
                      choose({ type: "deck/open-panel", panel: "add-column" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:view-column-outline-rounded"
                    label="デッキを編集"
                    onClick={() =>
                      choose({ type: "deck/open-panel", panel: "arrange" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:manage-search-rounded"
                    label="コマンドパレット"
                    onClick={() => choose({ type: "deck/open-palette" })}
                  />
                </nav>
                <hr class="my-1 border-primary border-t" />
                <div class="py-1">
                  <Row
                    icon="i-material-symbols:settings-outline-rounded"
                    label="設定"
                    onClick={() => choose({ type: "deck/open-settings" })}
                  />
                  <Row
                    icon="i-material-symbols:info-outline-rounded"
                    label="Streets について"
                    onClick={() => choose({ type: "deck/open-about" })}
                  />
                  <Show when={feedback()}>
                    <Row
                      icon="i-material-symbols:feedback-outline-rounded"
                      label="フィードバックを送る"
                      onClick={() => choose(() => setFeedbackOpen(true))}
                    />
                  </Show>
                </div>
              </div>
              <Show when={props.pubkey}>
                <div class="shrink-0 border-primary border-t py-1">
                  <Row
                    icon="i-material-symbols:logout-rounded"
                    label="ログアウト"
                    muted
                    onClick={() => choose(props.onLogout)}
                  />
                </div>
              </Show>
            </ArkDialog.Content>
          </ArkDialog.Positioner>
        </Portal>
      </ArkDialog.Root>
      {/* メニューは閉じると中身を外すので、ダイアログはメニューの外に置く。 */}
      <Show when={feedback()}>
        {(href) => (
          <FeedbackDialog
            href={href()}
            open={feedbackOpen()}
            onClose={() => setFeedbackOpen(false)}
          />
        )}
      </Show>
    </>
  );
};

export default MobileMenu;
