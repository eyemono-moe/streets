import { Dialog } from "@ark-ui/solid/dialog";
import { parseContent } from "@streets/core/nostr/content";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ComposeState } from "@streets/core/view/compose";
import { type Component, Show, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { useDispatch } from "../ui-events";
import AuthorNames from "./AuthorNames";
import Avatar from "./Avatar";
import NoteText from "./NoteText";
import { ComposeTools, countCharacters } from "./compose-parts";

const ReplyDialog: Component<{ target: NostrEvent; state: ComposeState }> = (
  props,
) => {
  const actions = useEventActions();
  const dispatch = useDispatch();
  const targetTokens = createMemo(() =>
    parseContent(props.target.content.trim(), props.target.tags),
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open) dispatch({ type: "compose/close" });
      }}
    >
      <Portal>
        <Dialog.Backdrop class="motion-fade fixed inset-0 bg-ui-950/40" />
        <Dialog.Positioner class="fixed inset-0 grid place-items-center p-4">
          <Dialog.Content class="motion-pop c-primary w-full max-w-130 overflow-hidden rounded-3 border border-primary bg-primary outline-none">
            <div class="flex h-12 items-center gap-2 pr-3 pl-4">
              <Dialog.Title class="flex-1 font-600 text-body">
                返信する
              </Dialog.Title>
              <Dialog.CloseTrigger
                aria-label="閉じる"
                class="grid size-7 place-items-center rounded-2 bg-secondary enabled:cursor-pointer"
                disabled={props.state.sending}
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
                dispatch({ type: "compose/submit" });
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
                  disabled={props.state.sending}
                  placeholder="返信を書く"
                  value={props.state.content}
                  onInput={(event) =>
                    dispatch({
                      type: "compose/input",
                      content: event.currentTarget.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      dispatch({ type: "compose/submit" });
                    }
                  }}
                />
              </div>
              <ComposeTools
                count={`${countCharacters(props.state.content)}`}
                label="返信"
                sending={props.state.sending}
                disabled={props.state.content.trim().length === 0}
              />
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default ReplyDialog;
