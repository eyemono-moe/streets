import { Dialog } from "@ark-ui/solid/dialog";
import { type Component, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { actionErrorMessage, useEventActions } from "../actions";
import Avatar from "./Avatar";
import { ComposeTools, countCharacters } from "./compose-parts";

/** 新しいノートを書く。返信は `ReplyDialog`（返信先を上に出す点だけが違う）。 */
const ComposeDialog: Component<{ onClose: () => void }> = (props) => {
  const actions = useEventActions();
  const [content, setContent] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const submit = async () => {
    const text = content().trim();
    if (!actions || text.length === 0 || sending()) return;
    setSending(true);
    setError(undefined);
    try {
      await actions.post(text);
      props.onClose();
    } catch (cause) {
      // 本文は残し、そのまま再試行できるようにする。
      setError(actionErrorMessage(cause));
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
                ノートを書く
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
                  aria-label="ノートの本文"
                  class="c-primary placeholder:c-secondary min-h-10 flex-1 resize-none bg-transparent text-h3 outline-none [field-sizing:content]"
                  disabled={sending()}
                  placeholder="いま何してる？"
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
              <Show when={error()}>
                {(message) => (
                  <p class="c-danger px-4 pt-2 text-caption">{message()}</p>
                )}
              </Show>
              <ComposeTools
                count={`${countCharacters(content())} 文字`}
                label="投稿"
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

export default ComposeDialog;
