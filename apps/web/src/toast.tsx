import { Toast, Toaster, createToaster } from "@ark-ui/solid/toast";
import { type Component, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { isMultiColumn } from "./deck-layout-setting";
import IconButton from "./ui/IconButton";
import { actionErrorMessage, wasReported } from "./write-errors";
import { showWriteProgress } from "./write-progress-setting";
import WriteProgressToast, { type WriteToastMeta } from "./WriteProgressToast";

/** 済んだ知らせは、目の端で読めれば足りる。 */
export const SAVED_DURATION_MS = 2500;
/** 失敗や、届かなかったリレーがあるときは、理由を読めるだけ長く出す。 */
export const TROUBLE_DURATION_MS = 8000;

type AppToaster = ReturnType<typeof createToaster>;

/**
 * 1 列の表示では主な操作を下のバーに寄せているので、上の中央に出して重ねない。
 */
export const createAppToaster = (wide: boolean): AppToaster =>
  createToaster({
    placement: wide ? "bottom-end" : "top",
    // 重ねて奥を少しだけ覗かせ、ポインタを乗せたら広げる。
    overlap: true,
    gap: 8,
  });

// 置き場所は作るときにしか決められないので、並べ方ごとに 1 つずつ持ち、
// 新しい知らせをいまの並べ方の方へ出す。
const multiToaster = createAppToaster(true);
const singleToaster = createAppToaster(false);
const currentToaster = () => (isMultiColumn() ? multiToaster : singleToaster);
// 並べ方を変える前に出したものは、出した方で書き換え・片付ける。
const holding = (id: string) =>
  [multiToaster, singleToaster].find((t) => t.isVisible(id)) ??
  currentToaster();

/**
 * 失敗の知らせは 1 か所に集める。ボタンごとに文言を置くと、押した場所ごとに
 * 出方が変わり、狭いカラムでは行が押し出されて本文が動く。
 */
export const toaster: Pick<AppToaster, "create" | "update" | "remove"> = {
  create: (options) => currentToaster().create(options),
  update: (id, options) => holding(id).update(id, options),
  remove: (id) => {
    multiToaster.remove(id);
    return singleToaster.remove(id);
  },
};

/** 済んだことを短く知らせる（保存など、すぐ消えてよいもの）。 */
export const notifySaved = (title: string): void => {
  // 進み具合を出しているなら、そのトーストがもう「保存しました」と言っている。
  if (showWriteProgress()) return;
  toaster.create({ type: "success", title, duration: SAVED_DURATION_MS });
};

/** コピーなど、書き込み進捗とは無関係な操作の成功を知らせる。 */
export const notifySuccess = (title: string): void => {
  toaster.create({ type: "success", title, duration: SAVED_DURATION_MS });
};

/** 操作が失敗したことを知らせる。理由の文言は `actionErrorMessage` に揃える。 */
export const notifyError = (cause: unknown, what?: string): void => {
  // 書き込みの進み具合のトーストが、もう同じ失敗を出している。
  if (wasReported(cause)) return;
  toaster.create({
    type: "error",
    title: what ?? "操作に失敗しました",
    description: actionErrorMessage(cause),
    duration: TROUBLE_DURATION_MS,
  });
};

const CloseButton: Component = () => (
  <Toast.CloseTrigger
    asChild={(trigger) => (
      <IconButton
        {...trigger()}
        icon="i-material-symbols:close-rounded"
        label="閉じる"
      />
    )}
  />
);

/**
 * 重なりの位置・大きさ・濃さは Ark UI が CSS 変数で渡すだけなので、ここで当てる。
 * 奥のトーストは手前と同じ高さに揃えられるので、中身は隠して枠だけを覗かせる。
 * 外枠ははみ出しを切らない。Ark UI が置く、トーストの間の隙間を埋める箱が外へ出ている。
 */
const ToastCard: Component<{ children: JSX.Element }> = (props) => (
  <Toast.Root class="w-80 max-w-[calc(100vw-2rem)] rounded-2 border border-primary bg-primary shadow-[0_8px_24px_rgba(0,0,0,0.18)] [transition-property:translate,scale,opacity,height] duration-180 ease-out [scale:var(--scale)] [translate:var(--x)_var(--y)] h-[var(--height)] opacity-[var(--opacity)] z-[var(--z-index)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
    <div class="flex h-full items-start gap-2 overflow-hidden p-3 transition-opacity duration-150 [[data-overlap][data-sibling]>&]:opacity-0">
      {props.children}
    </div>
  </Toast.Root>
);

/** `toaster` に積まれたトーストを並べる。ストーリーでは別の `toaster` を渡す。 */
export const ToastStack: Component<{ toaster: AppToaster }> = (props) => (
  <Toaster toaster={props.toaster}>
    {(toast) => (
      <ToastCard>
        <Show
          when={(toast().meta as Partial<WriteToastMeta> | undefined)?.write}
          fallback={
            <>
              <span
                class="size-4.5 shrink-0"
                classList={{
                  "i-material-symbols:error-outline-rounded c-danger":
                    toast().type !== "success",
                  "i-material-symbols:check-circle-outline-rounded c-accent-5":
                    toast().type === "success",
                }}
                aria-hidden="true"
              />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <Toast.Title class="c-primary font-600 text-body">
                  {toast().title}
                </Toast.Title>
                <Show when={toast().description}>
                  <Toast.Description class="c-secondary break-anywhere text-caption">
                    {toast().description}
                  </Toast.Description>
                </Show>
              </div>
            </>
          }
        >
          {(write) => (
            <div class="min-w-0 flex-1">
              <WriteProgressToast meta={write()} />
            </div>
          )}
        </Show>
        <CloseButton />
      </ToastCard>
    )}
  </Toaster>
);

/**
 * 画面のどこか 1 つに置く。トーストはここへ出る。`#root` は `isolation: isolate` で
 * 重なりを閉じているので、その中に置くとダイアログ（body 直下に出る）より後ろになる。
 * body へ出して、どの画面の上にも出るようにする。
 */
export const ErrorToaster: Component = () => (
  <Portal>
    <ToastStack toaster={multiToaster} />
    <ToastStack toaster={singleToaster} />
  </Portal>
);
