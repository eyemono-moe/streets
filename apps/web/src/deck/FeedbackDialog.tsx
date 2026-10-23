import type { Component } from "solid-js";
import { t } from "../i18n/locale";
import Button, { ButtonLink } from "../ui/Button";
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
            {t("deck.feedback.title")}
          </DialogTitle>
          <DialogClose />
        </div>
        <DialogDescription class="flex flex-col gap-3 px-4 pb-4 text-caption">
          <p>{t("deck.feedback.intro")}</p>
          <p class="c-secondary">{t("deck.feedback.privacy")}</p>
        </DialogDescription>
        <div class="flex justify-end gap-2 border-primary border-t p-3">
          <Button variant="ghost" onClick={props.onClose}>
            {t("deck.feedback.close")}
          </Button>
          <ButtonLink
            variant="primary"
            icon="i-material-symbols:open-in-new-rounded"
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={props.onClose}
          >
            {t("deck.feedback.submit")}
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
