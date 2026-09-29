import { type Component, Show, createSignal } from "solid-js";
import Button, { ButtonLink } from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import IconButton from "../ui/IconButton";

const context = (): string =>
  [
    `Commit: ${import.meta.env.VITE_COMMIT_SHA}`,
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

/** フィードバックの送り先を開く前に、何が公開されるかを知らせる。 */
export const FeedbackDialog: Component<{
  href: string;
  open: boolean;
  onClose: () => void;
}> = (props) => (
  <DialogRoot open={props.open} onClose={props.onClose}>
    <DialogPortal>
      <DialogContent class="w-full max-w-110 rounded-3 border border-primary">
        <div class="flex min-h-12 items-start gap-2 py-3 pr-3 pl-4">
          <DialogTitle class="min-w-0 flex-1 font-600 text-body">
            Streets へのフィードバック
          </DialogTitle>
          <DialogClose />
        </div>
        <DialogDescription class="flex flex-col gap-3 px-4 pb-4 text-caption">
          <p>
            不具合や分かりにくいところ、欲しい機能を教えてください。いただいた声は、Streets
            をよくするために使います。
          </p>
          <p class="c-secondary">
            入力した報告本文はGoogle
            Formsに保存され、AIで整理したうえで公開GitHub
            Issueとして登録されます。スクリーンショット等はAIやGitHubへ自動送信されません。個人情報、秘密鍵、公開したくない内容は入力しないでください。
          </p>
        </DialogDescription>
        <div class="flex justify-end gap-2 border-primary border-t p-3">
          <Button variant="ghost" onClick={props.onClose}>
            閉じる
          </Button>
          <ButtonLink
            variant="primary"
            icon="i-material-symbols:open-in-new-rounded"
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={props.onClose}
          >
            不具合を報告・機能をリクエスト
          </ButtonLink>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
);

/** 送り先の URL。設定されていなければ undefined（フィードバックの操作を出さない）。 */
export const feedbackHref = (template?: string | null): string | undefined =>
  resolveFeedbackUrl(
    template === null
      ? undefined
      : (template ?? import.meta.env.VITE_FEEDBACK_URL),
  );

const FeedbackLink: Component<{
  /** Storybookでは実際のフォームを開かないURLを注入する。nullなら未設定状態。 */
  template?: string | null;
  /** ダイアログのStory用。 */
  initialOpen?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const href = () => feedbackHref(props.template);

  return (
    <Show
      when={href()}
      fallback={
        <IconButton
          size="lg"
          icon="i-material-symbols:feedback-outline-rounded"
          label="フィードバック（送信先が未設定）"
          title="フィードバック送信先が未設定です"
          disabled
        />
      }
    >
      {(url) => (
        <>
          <IconButton
            size="lg"
            icon="i-material-symbols:feedback-outline-rounded"
            label="フィードバックを送る"
            onClick={() => setOpen(true)}
          />
          <FeedbackDialog
            href={url()}
            open={open()}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </Show>
  );
};

export default FeedbackLink;
