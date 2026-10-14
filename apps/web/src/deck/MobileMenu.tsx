import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import {
  type Component,
  type JSX,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import Avatar from "../note/Avatar";
import Name from "../note/Name";
import { useUserStatuses } from "../status/use-user-statuses";
import { type UiEvent, useDispatch } from "../ui-events";
import { Portal } from "../ui/Portal";
import { FeedbackDialog, feedbackHref } from "./FeedbackDialog";
import { trackMenuDrag } from "./menu-drag";

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
}> = (props) => {
  const dispatch = useDispatch();
  const statuses = useUserStatuses(() => props.pubkey);
  const current = () => statuses().find((status) => status.type === "general");
  const feedback = () => feedbackHref(props.feedbackUrl);
  const [feedbackOpen, setFeedbackOpen] = createSignal(false);
  // 開いた後、左へ押し戻している途中なら、出ている割合。
  const [pushing, setPushing] = createSignal<number>();
  // 指を離した位置。開く・閉じる動きをそこから始め、動き終えたら忘れる。
  const [released, setReleased] = createSignal<string>();
  let content: HTMLDivElement | undefined;
  const dragging = () => pushing() ?? props.pulling;
  const offset = (progress: number) => `${(progress - 1) * 100}%`;
  // 引き出していた指を離したら、その位置から開く・戻る。
  createEffect(
    on(
      () => props.pulling,
      (now, before) => {
        if (now === undefined && before !== undefined) {
          setReleased(offset(before));
        }
      },
    ),
  );

  // 選んだ先が開いたら、メニューは閉じる。パネルや設定を開く操作はデッキの段が閉じるので、
  // ここで閉じるのはそれ以外（ログイン・ステータス・フィードバック・ログアウト）。
  const choose = (event: UiEvent) => {
    dispatch({ type: "deck/close-menu" });
    dispatch(event);
  };

  const trackPush = (el: HTMLElement) => {
    const stop = trackMenuDrag(el, {
      toward: "left",
      accepts: () => props.open,
      move: setPushing,
      end: (open, progress) => {
        setReleased(offset(progress));
        setPushing(undefined);
        if (!open) dispatch({ type: "deck/close-menu" });
      },
    });
    onCleanup(stop);
  };

  return (
    <>
      <ArkDialog.Root
        open={props.open || props.pulling !== undefined}
        onOpenChange={(details) => {
          if (!details.open) dispatch({ type: "deck/close-menu" });
        }}
        // 開いたら、行ではなくメニュー全体に焦点を置く。指で引き出している途中に、先頭の行に
        // 焦点の枠が出て押したように見えるのを避ける。
        initialFocusEl={() => content ?? null}
        lazyMount
        unmountOnExit
      >
        <Portal>
          <ArkDialog.Backdrop
            class="motion-fade fixed inset-0 bg-ui-950/40"
            style={(() => {
              const progress = dragging();
              return progress === undefined
                ? undefined
                : { opacity: progress, animation: "none" };
            })()}
          />
          <ArkDialog.Positioner
            ref={trackPush}
            class="fixed inset-0 flex justify-start"
          >
            <ArkDialog.Content
              ref={content}
              tabIndex={-1}
              aria-label="メニュー"
              class="motion-menu c-primary flex h-full w-[min(300px,85vw)] flex-col bg-primary pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-lg outline-none"
              style={(() => {
                const progress = dragging();
                const edge = released();
                return {
                  "--menu-from": edge ?? "-100%",
                  "--menu-x": edge ?? "0px",
                  ...(progress === undefined
                    ? {}
                    : {
                        transform: `translate3d(${offset(progress)},0,0)`,
                        animation: "none",
                      }),
                };
              })()}
              onAnimationEnd={() => setReleased(undefined)}
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
                      <span class="min-w-0 truncate font-700 text-body">
                        <Name pubkey={pubkey()} />
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
                      dispatch({ type: "deck/open-panel", panel: "search" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:add-rounded"
                    label="カラムを追加"
                    onClick={() =>
                      dispatch({ type: "deck/open-panel", panel: "add-column" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:view-column-outline-rounded"
                    label="デッキを編集"
                    onClick={() =>
                      dispatch({ type: "deck/open-panel", panel: "arrange" })
                    }
                  />
                  <Row
                    icon="i-material-symbols:manage-search-rounded"
                    label="コマンドパレット"
                    onClick={() => dispatch({ type: "deck/open-palette" })}
                  />
                </nav>
                <hr class="my-1 border-primary border-t" />
                <div class="py-1">
                  <Row
                    icon="i-material-symbols:settings-outline-rounded"
                    label="設定"
                    onClick={() => dispatch({ type: "deck/open-settings" })}
                  />
                  <Row
                    icon="i-material-symbols:info-outline-rounded"
                    label="Streets について"
                    onClick={() => dispatch({ type: "deck/open-about" })}
                  />
                  <Show when={feedback()}>
                    <Row
                      icon="i-material-symbols:feedback-outline-rounded"
                      label="フィードバックを送る"
                      onClick={() => {
                        dispatch({ type: "deck/close-menu" });
                        setFeedbackOpen(true);
                      }}
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
                    onClick={() => {
                      dispatch({ type: "deck/close-menu" });
                      props.onLogout();
                    }}
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
