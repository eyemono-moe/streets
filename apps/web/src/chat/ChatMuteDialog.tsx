import type { NostrEvent } from "@streets/core/nostr/event";
import type { ChatMuteState } from "@streets/core/view/chat-mute";
import { type Component, Show } from "solid-js";
import AuthorNames from "../note/AuthorNames";
import Avatar from "../note/Avatar";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import TextField from "../ui/TextField";

const TITLE = {
  message: "このメッセージをミュートする",
  user: "このユーザーをミュートする",
} as const;

const BODY = {
  message:
    "このチャット内でのみミュートされます。ミュートしたメッセージは畳んで出し、押せばいつでも読めます。",
  user: "このチャット内でのみミュートされます。すべてのチャンネルで、この人の発言を畳んで出します。押せばいつでも読めます。",
} as const;

/** チャット内のミュートを確かめる。状態は裁定する段（チャンネルのカラム）が持つ。 */
const ChatMuteDialog: Component<{
  state: ChatMuteState;
  /** ミュートする発言。手元に無ければ、書き手だけを出す。 */
  target?: NostrEvent;
}> = (props) => {
  const dispatch = useDispatch();
  const open = () => (props.state.phase === "closed" ? undefined : props.state);
  return (
    <DialogRoot
      open={props.state.phase !== "closed"}
      onClose={() => dispatch({ type: "chat-mute/close" })}
    >
      <DialogPortal>
        <DialogContent class="w-full max-w-100 rounded-3 border border-primary">
          <Show when={open()}>
            {(state) => (
              <form
                class="flex flex-col gap-4 p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  dispatch({ type: "chat-mute/submit" });
                }}
              >
                <div class="flex items-center gap-2">
                  <DialogTitle class="flex-1 font-700 text-h3">
                    {TITLE[state().kind]}
                  </DialogTitle>
                  <DialogClose disabled={state().phase === "sending"} />
                </div>
                <div class="flex items-start gap-2 rounded-2 bg-secondary p-2.5">
                  <Avatar pubkey={state().pubkey} size="tiny" />
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <AuthorNames pubkey={state().pubkey} size="compact" />
                    <Show when={state().kind === "message" && props.target}>
                      {(target) => (
                        <p class="c-secondary line-clamp-2 break-anywhere text-caption">
                          {target().content}
                        </p>
                      )}
                    </Show>
                  </div>
                </div>
                <p class="text-body">{BODY[state().kind]}</p>
                <p class="c-secondary text-caption">
                  ミュートしたことは公開され、ほかの人の画面でも畳まれることがあります。投稿など、チャンネルの外は今までどおり見えます。
                </p>
                <TextField
                  label="理由（任意）"
                  value={state().reason}
                  onInput={(value) =>
                    dispatch({ type: "chat-mute/reason", value })
                  }
                  placeholder="例：宣伝"
                />
                <div class="flex justify-end gap-2">
                  <Button
                    shape="rounded"
                    icon="i-material-symbols:close-rounded"
                    disabled={state().phase === "sending"}
                    onClick={() => dispatch({ type: "chat-mute/close" })}
                  >
                    やめる
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    shape="rounded"
                    icon={
                      state().kind === "message"
                        ? "i-material-symbols:visibility-off-outline-rounded"
                        : "i-material-symbols:person-off-outline-rounded"
                    }
                    disabled={state().phase === "sending"}
                  >
                    <Show when={state().phase !== "sending"} fallback="送信中…">
                      ミュートする
                    </Show>
                  </Button>
                </div>
              </form>
            )}
          </Show>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default ChatMuteDialog;
