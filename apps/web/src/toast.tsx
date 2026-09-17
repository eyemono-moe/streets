import { Toast, Toaster, createToaster } from "@ark-ui/solid/toast";
import { type Component, Show } from "solid-js";
import { actionErrorMessage } from "./actions";

/**
 * 失敗の知らせは 1 か所に集める。ボタンごとに文言を置くと、押した場所ごとに
 * 出方が変わり、狭いカラムでは行が押し出されて本文が動く。
 */
const toaster = createToaster({
  placement: "bottom-end",
  overlap: true,
  gap: 8,
});

/** 済んだことを短く知らせる（保存など、すぐ消えてよいもの）。 */
export const notifySaved = (title: string): void => {
  toaster.create({ type: "success", title });
};

/** 操作が失敗したことを知らせる。理由の文言は `actionErrorMessage` に揃える。 */
export const notifyError = (cause: unknown, what?: string): void => {
  toaster.create({
    type: "error",
    title: what ?? "操作に失敗しました",
    description: actionErrorMessage(cause),
  });
};

/** 画面のどこか 1 つに置く。トーストはここへ出る。 */
export const ErrorToaster: Component = () => (
  <Toaster toaster={toaster}>
    {(toast) => (
      <Toast.Root class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2 border border-primary bg-primary p-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-[translate,scale,opacity] duration-150 ease-out dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
        <div class="flex items-start gap-2">
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
          <Toast.Title class="c-primary min-w-0 flex-1 font-600 text-body">
            {toast().title}
          </Toast.Title>
          <Toast.CloseTrigger
            aria-label="閉じる"
            class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
          >
            <span
              class="i-material-symbols:close-rounded size-4.5"
              aria-hidden="true"
            />
          </Toast.CloseTrigger>
        </div>
        <Show when={toast().description}>
          <Toast.Description class="c-secondary break-anywhere pl-6.5 text-caption">
            {toast().description}
          </Toast.Description>
        </Show>
      </Toast.Root>
    )}
  </Toaster>
);
