import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";

const context = (): string =>
  [
    `Streets: ${import.meta.env.VITE_APP_VERSION || "unknown"}`,
    `Origin: ${window.location.origin}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n");

const resolveFeedbackUrl = (
  template: string | undefined,
): string | undefined => {
  if (!template) return undefined;
  try {
    const expanded = template
      .replaceAll("{context}", encodeURIComponent(context()))
      .replaceAll("%7Bcontext%7D", encodeURIComponent(context()));
    const url = new URL(expanded);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const FeedbackLink: Component<{
  /** Storybookでは実際のフォームを開かないURLを注入する。nullなら未設定状態。 */
  template?: string | null;
  size: "sidebar" | "tab";
  /** ダイアログのStory用。 */
  initialOpen?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const template = () =>
    props.template === null
      ? undefined
      : (props.template ?? import.meta.env.VITE_FEEDBACK_URL);
  const href = () => resolveFeedbackUrl(template());
  const className = () =>
    props.size === "sidebar"
      ? "c-secondary grid size-10 shrink-0 place-items-center rounded-2 bg-transparent hover:bg-secondary"
      : "c-secondary grid h-11 w-11 place-items-center bg-transparent";

  return (
    <Show
      when={href()}
      fallback={
        <span
          aria-label="フィードバック（送信先が未設定）"
          title="フィードバック送信先が未設定です"
          class={`${className()} opacity-40`}
        >
          <span class="sr-only">フィードバックを送る</span>
          <span
            class="i-material-symbols:feedback-outline-rounded size-5.5"
            aria-hidden="true"
          />
        </span>
      }
    >
      {(url) => (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="フィードバックを送る"
            title="フィードバックを送る"
            class={`${className()} cursor-pointer`}
          >
            <span class="sr-only">フィードバックを送る</span>
            <span
              class="i-material-symbols:feedback-outline-rounded size-5.5"
              aria-hidden="true"
            />
          </button>
          <DialogRoot open={open()} onClose={() => setOpen(false)}>
            <DialogPortal>
              <DialogContent class="flex w-full max-w-110 flex-col rounded-3 border border-primary">
                <div class="flex min-h-12 items-start gap-2 py-3 pr-3 pl-4">
                  <DialogTitle class="min-w-0 flex-1 font-600 text-body">
                    Streets β版へのフィードバック
                  </DialogTitle>
                  <DialogClose />
                </div>
                <DialogDescription class="flex flex-col gap-3 px-4 pb-4 text-caption">
                  <p>
                    Streetsは現在β版です。不具合、分かりにくいところ、欲しい機能をぜひ教えてください。
                  </p>
                  <p class="c-secondary">
                    送信内容はGoogle
                    Formsに保存され、AIで整理したうえで公開GitHub
                    Issueとして登録されます。個人情報、秘密鍵、公開したくない内容は入力しないでください。
                  </p>
                </DialogDescription>
                <div class="flex justify-end gap-2 border-primary border-t p-3">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    閉じる
                  </Button>
                  <Button
                    variant="primary"
                    icon="i-material-symbols:open-in-new-rounded"
                    onClick={() => {
                      window.open(url(), "_blank", "noopener,noreferrer");
                      setOpen(false);
                    }}
                  >
                    不具合を報告・機能をリクエスト
                  </Button>
                </div>
              </DialogContent>
            </DialogPortal>
          </DialogRoot>
        </>
      )}
    </Show>
  );
};

export default FeedbackLink;
