import type { NostrEvent } from "@streets/core/nostr/event";
import type { ComposeState } from "@streets/core/view/compose";
import { type Component, Show } from "solid-js";
import { useEventActions } from "../actions";
import { Mediates, useDispatch } from "../ui-events";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import Avatar from "./Avatar";
import Event from "./Event";
import { ComposeTools, countCharacters } from "./compose-parts";

const QuoteDialog: Component<{ target: NostrEvent; state: ComposeState }> = (
  props,
) => {
  const actions = useEventActions();
  const dispatch = useDispatch();

  return (
    <DialogRoot open onClose={() => dispatch({ type: "compose/close" })}>
      <DialogPortal>
        <DialogContent class="flex max-h-[80vh] w-full max-w-130 flex-col rounded-3 border border-primary">
          <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
            <DialogTitle class="flex-1 font-600 text-body">
              引用する
            </DialogTitle>
            <DialogClose disabled={props.state.sending} />
          </div>

          <form
            class="min-h-0 overflow-y-auto"
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
                aria-label="引用の本文"
                class="c-primary placeholder:c-secondary min-h-20 flex-1 resize-none bg-transparent text-h3 outline-none [field-sizing:content]"
                disabled={props.state.sending}
                placeholder="コメントを追加"
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

            <div class="mx-4 max-h-48 overflow-y-auto rounded-2 border border-primary">
              {/* 引用対象は確認用。ホバーカードは出すが、元のカラムは動かさない。 */}
              <Mediates handle={(event) => event.type === "stack/open"}>
                <Event event={props.target} size="compact" />
              </Mediates>
            </div>

            <ComposeTools
              count={`${countCharacters(props.state.content)}`}
              label="引用"
              sending={props.state.sending}
              disabled={props.state.content.trim().length === 0}
            />
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default QuoteDialog;
