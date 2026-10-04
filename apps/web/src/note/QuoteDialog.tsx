import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type ComposeState,
  canKeepDraft,
  canSend,
} from "@streets/core/view/compose";
import { type Component, Show } from "solid-js";
import { useEventActions } from "../actions";
import { useNoteSources } from "../completion/sources";
import { Mediates, useDispatch } from "../ui-events";
import Completion from "../ui/Completion";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import Avatar from "./Avatar";
import {
  ComposeAttachments,
  ComposeTools,
  ContentWarningField,
  countCharacters,
  useDropAndPaste,
} from "./compose-parts";
import Event from "./Event";
import { useComposeEmojiInsertion } from "./use-compose-emoji-insertion";

const QuoteDialog: Component<{ target: NostrEvent; state: ComposeState }> = (
  props,
) => {
  const actions = useEventActions();
  const dispatch = useDispatch();
  const emojiInsertion = useComposeEmojiInsertion();
  const dropAndPaste = useDropAndPaste();
  // 返信先・引用元の人を、人の候補の先頭に出す。
  const sources = useNoteSources(() => [props.target.pubkey]);

  return (
    <DialogRoot open onClose={() => dispatch({ type: "compose/close" })}>
      <DialogPortal>
        <DialogContent class="w-full max-w-130 rounded-3 border border-primary">
          <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
            <DialogTitle class="flex-1 font-600 text-body">
              引用する
            </DialogTitle>
            <DialogClose disabled={props.state.sending} />
          </div>

          <form
            class="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "compose/submit" });
            }}
          >
            <DialogBody>
              <ContentWarningField
                reason={props.state.contentWarning}
                disabled={props.state.sending}
              />
              <div class="flex items-start gap-3 px-4">
                <Show when={actions}>
                  {(actions) => (
                    <Avatar pubkey={actions().viewer} size="normal" />
                  )}
                </Show>
                <Completion sources={sources} label="入れる候補">
                  {(attach) => (
                    <textarea
                      ref={(element) => {
                        attach(element);
                        emojiInsertion.ref(element);
                      }}
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
                      {...dropAndPaste}
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
                  )}
                </Completion>
              </div>

              <div class="mx-4 max-h-48 overflow-y-auto rounded-2 border border-primary">
                {/* 引用対象は確認用。ホバーカードは出すが、元のカラムは動かさない。 */}
                <Mediates handle={(event) => event.type === "stack/open"}>
                  <Event event={props.target} size="compact" />
                </Mediates>
              </div>

              <ComposeAttachments
                attachments={props.state.attachments}
                disabled={props.state.sending}
              />
            </DialogBody>

            <ComposeTools
              count={`${countCharacters(props.state.content)}`}
              label="引用"
              sending={props.state.sending}
              contentWarning={props.state.contentWarning}
              disabled={!canSend(props.state)}
              onEmojiSelect={emojiInsertion.insert}
              emojiField={emojiInsertion.field}
              canKeepDraft={canKeepDraft(props.state)}
            />
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default QuoteDialog;
