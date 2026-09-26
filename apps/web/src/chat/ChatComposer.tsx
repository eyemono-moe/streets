import type { NostrEvent } from "@streets/core/nostr/event";
import { profileLabel } from "@streets/core/nostr/profile";
import { type ComposeState, canSend } from "@streets/core/view/compose";
import { type Component, Show } from "solid-js";
import { useNoteSources } from "../completion/sources";
import ComposeEmojiPicker from "../emoji/ComposeEmojiPicker";
import {
  ComposeAttachments,
  ImageButton,
  useDropAndPaste,
} from "../note/compose-parts";
import { useComposeEmojiInsertion } from "../note/use-compose-emoji-insertion";
import { useProfile } from "../note/use-profile";
import { useDispatch } from "../ui-events";
import Completion from "../ui/Completion";
import IconButton from "../ui/IconButton";

/**
 * チャンネルの入力欄。投稿欄と同じく、Enter は改行で、Ctrl+Enter（Mac は ⌘+Enter）で送る。
 */
const ChatComposer: Component<{
  state: ComposeState;
  channelName: string;
  replyTo?: NostrEvent;
}> = (props) => {
  const dispatch = useDispatch();
  const dropAndPaste = useDropAndPaste();
  const emojiInsertion = useComposeEmojiInsertion();
  const sources = useNoteSources(() =>
    props.replyTo ? [props.replyTo.pubkey] : [],
  );
  const replyProfile = useProfile(() => props.replyTo?.pubkey);

  return (
    <form
      class="flex shrink-0 flex-col gap-2 border-primary border-t bg-primary p-3"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: "compose/submit" });
      }}
    >
      <Show when={props.replyTo}>
        {(target) => (
          <div class="c-secondary flex items-center gap-1.5 rounded-2 bg-secondary px-2.5 py-1.5 text-caption">
            <span
              class="i-material-symbols:reply-rounded size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate">
              {profileLabel(replyProfile(), target().pubkey)} に返信
            </span>
            <IconButton
              icon="i-material-symbols:close-rounded"
              label="返信をやめる"
              onClick={() => dispatch({ type: "chat/cancel-reply" })}
            />
          </div>
        )}
      </Show>
      <ComposeAttachments
        attachments={props.state.attachments}
        disabled={props.state.sending}
      />
      <div class="flex items-end gap-1.5">
        <ImageButton />
        <ComposeEmojiPicker
          disabled={props.state.sending}
          onSelect={emojiInsertion.insert}
          field={emojiInsertion.field}
        />
        <Completion sources={sources} label="入れる候補">
          {(attach) => (
            <textarea
              ref={(element) => {
                attach(element);
                emojiInsertion.ref(element);
              }}
              rows={1}
              aria-label={`${props.channelName} にメッセージを送信`}
              class="c-primary placeholder:c-secondary max-h-40 min-h-9 min-w-0 flex-1 resize-none rounded-2 border border-secondary bg-primary px-3 py-1.5 text-body outline-none placeholder:truncate focus-visible:ring-2 focus-visible:ring-accent-5"
              // 空の間は置き文字に合わせて伸ばさない。狭いカラムで置き文字が折り返し、
              // 何も書いていないのに欄が 2 行になる。
              classList={{
                "[field-sizing:content]": props.state.content !== "",
              }}
              disabled={props.state.sending}
              placeholder="このチャンネルにメッセージを送信"
              value={props.state.content}
              onInput={(event) =>
                dispatch({
                  type: "compose/input",
                  content: event.currentTarget.value,
                })
              }
              {...dropAndPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  dispatch({ type: "compose/submit" });
                }
              }}
            />
          )}
        </Completion>
        <IconButton
          type="submit"
          variant="primary"
          icon="i-material-symbols:send-rounded"
          label="送る"
          size="md"
          circle
          disabled={props.state.sending || !canSend(props.state)}
        />
      </div>
    </form>
  );
};

export default ChatComposer;
