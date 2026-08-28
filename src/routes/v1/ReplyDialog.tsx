import { Dialog } from "@ark-ui/solid/dialog";
import { type Component, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import type { NostrEvent } from "../../core/nostr/event";
import EventView from "./EventView";
import {
  eventActionErrorMessage,
  useOptionalEventActions,
} from "./event-actions";

const ReplyDialog: Component<{ target: NostrEvent; onClose(): void }> = (
  props,
) => {
  const actions = useOptionalEventActions();
  const [content, setContent] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const submit = async () => {
    const text = content().trim();
    if (!actions || text.length === 0 || sending()) return;
    setSending(true);
    setError(undefined);
    try {
      await actions.reply(props.target, text);
      props.onClose();
    } catch (cause) {
      // 失敗時は content を触らず、そのまま再試行できる。
      setError(eventActionErrorMessage(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open && !sending()) props.onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop class="fixed inset-0 z-60 bg-ui-950/55" />
        <Dialog.Positioner class="fixed inset-0 z-70 grid place-items-center p-6">
          <Dialog.Content
            class="c-primary relative w-[min(520px,calc(100vw-48px))] rounded-3 border border-primary bg-primary p-4 shadow-ui/30 shadow-xl outline-none"
            data-testid="reply-dialog"
          >
            <Dialog.Title class="font-700 text-h3">返信する</Dialog.Title>
            <Dialog.Description class="sr-only">
              選択したノートへの返信を書きます。
            </Dialog.Description>
            <Dialog.CloseTrigger
              aria-label="返信を閉じる"
              class="absolute top-3 right-3 grid h-8 w-8 appearance-none place-items-center rounded-full bg-secondary enabled:cursor-pointer enabled:hover:bg-alpha-hover"
              data-testid="reply-close"
              disabled={sending()}
            >
              <span
                class="i-material-symbols:close-rounded h-5 w-5"
                aria-hidden="true"
              />
            </Dialog.CloseTrigger>

            <div class="mt-3 border-secondary border-l-2 pl-3">
              <EventView
                id={props.target.id}
                variant="compact"
                disableThreadOpen
              />
            </div>

            <form
              class="mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <textarea
                autofocus
                class="min-h-24 w-full resize-y appearance-none rounded-2 border border-primary bg-primary p-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5"
                data-testid="reply-input"
                disabled={sending()}
                placeholder="返信を入力"
                value={content()}
                onInput={(event) => setContent(event.currentTarget.value)}
              />
              <Show when={error()}>
                {(message) => (
                  <p
                    class="mt-2 text-caption text-red-8 dark:text-red-4"
                    data-testid="reply-error"
                  >
                    {message()}
                  </p>
                )}
              </Show>
              <div class="mt-3 flex items-center justify-end gap-3">
                <span
                  class="c-secondary text-caption"
                  data-testid="reply-count"
                >
                  {content().length}文字
                </span>
                <button
                  class="appearance-none rounded-full bg-accent-5 px-4 py-2 font-700 text-caption text-white enabled:cursor-pointer disabled:opacity-50"
                  data-testid="reply-submit"
                  disabled={sending() || content().trim().length === 0}
                  type="submit"
                >
                  {sending() ? "送信中…" : "返信"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default ReplyDialog;
