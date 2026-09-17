import { Dialog } from "@ark-ui/solid/dialog";
import { parseContent } from "@streets/core/nostr/content";
import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { notifyError } from "../toast";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import NoteText from "./NoteText";
import { ComposeTools, countCharacters } from "./compose-parts";

const ReplyDialog: Component<{ target: NostrEvent; onClose: () => void }> = (
  props,
) => {
  const actions = useEventActions();
  const [content, setContent] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const targetTokens = createMemo(() =>
    parseContent(props.target.content.trim(), props.target.tags),
  );

  const submit = async () => {
    const text = content().trim();
    if (!actions || text.length === 0 || sending()) return;
    setSending(true);
    try {
      await actions.reply(props.target, text);
      props.onClose();
    } catch (cause) {
      // 本文は残し、そのまま再試行できるようにする。理由はトーストで出す。
      notifyError(cause, "返信できませんでした");
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
        <Dialog.Backdrop class="fixed inset-0 z-60 bg-ui-950/40" />
        <Dialog.Positioner class="fixed inset-0 z-70 grid place-items-center p-4">
          <Dialog.Content class="c-primary w-full max-w-130 overflow-hidden rounded-3 border border-primary bg-primary outline-none">
            <div class="flex h-12 items-center gap-2 pr-3 pl-4">
              <Dialog.Title class="flex-1 font-600 text-body">
                返信する
              </Dialog.Title>
              <Dialog.CloseTrigger
                aria-label="閉じる"
                class="grid size-7 place-items-center rounded-2 bg-secondary enabled:cursor-pointer"
                disabled={sending()}
              >
                <span
                  class="i-material-symbols:close-rounded size-4.5"
                  aria-hidden="true"
                />
              </Dialog.CloseTrigger>
            </div>

            <div class="flex items-start gap-2.5 px-4 pb-3">
              <div class="flex flex-col items-center gap-1 self-stretch">
                <Avatar pubkey={props.target.pubkey} size="compact" />
                <div class="min-h-6 w-0.5 flex-1 bg-tertiary" />
              </div>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <AuthorNames pubkey={props.target.pubkey} size="normal" />
                <NoteText
                  tokens={targetTokens()}
                  class="c-secondary text-body"
                />
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div class="flex items-start gap-3 px-4">
                <Show when={actions}>
                  {(actions) => (
                    <Avatar pubkey={actions().viewer} size="normal" />
                  )}
                </Show>
                <textarea
                  autofocus
                  aria-label="返信の本文"
                  class="c-primary placeholder:c-secondary min-h-10 flex-1 resize-none bg-transparent text-h3 outline-none [field-sizing:content]"
                  disabled={sending()}
                  placeholder="返信を書く"
                  value={content()}
                  onInput={(event) => setContent(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
              </div>
              <ComposeTools
                count={`${countCharacters(content())}`}
                label="返信"
                sending={sending()}
                disabled={content().trim().length === 0}
              />
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default ReplyDialog;
