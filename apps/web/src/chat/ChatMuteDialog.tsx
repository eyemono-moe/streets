import type { NostrEvent } from "@streets/core/nostr/event";
import type {
  ChatMuteKind,
  ChatMuteScope,
  ChatMuteState,
} from "@streets/core/view/chat-mute";
import { type Component, Show } from "solid-js";
import AuthorNames from "../note/AuthorNames";
import Avatar from "../note/Avatar";
import { hiddenUnderWarning, warningLabel } from "../note/ContentWarningGate";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import TextField from "../ui/TextField";

const KIND_OPTIONS = [
  { value: "message", label: "この発言" },
  { value: "user", label: "この人" },
] as const;

const SCOPE_OPTIONS = [
  { value: "channel", label: "このチャンネルだけ" },
  { value: "everywhere", label: "どこでも" },
] as const;

const bodyOf = (kind: ChatMuteKind, scope: ChatMuteScope): string => {
  if (scope === "everywhere")
    return kind === "message"
      ? "この発言を、すべての画面で隠します。ミュートの設定から、いつでも解除できます。"
      : "この人の投稿や発言を、すべての画面で隠します。ミュートの設定から、いつでも解除できます。";
  return kind === "message"
    ? "このチャンネルの中でだけ、この発言を畳んで出します。押せばいつでも読めます。"
    : "すべてのチャンネルで、この人の発言を畳んで出します。押せばいつでも読めます。投稿など、チャンネルの外は今までどおり見えます。";
};

/** チャンネルの発言のミュートを選ばせる。状態は裁定する段（チャンネルのカラム）が持つ。 */
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
                class="flex min-h-0 flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  dispatch({ type: "chat-mute/submit" });
                }}
              >
                <div class="flex shrink-0 items-center gap-2 px-5 pt-5">
                  <DialogTitle class="flex-1 font-700 text-h3">
                    ミュート
                  </DialogTitle>
                  <DialogClose disabled={state().phase === "sending"} />
                </div>
                <DialogBody class="flex flex-col gap-4 p-5">
                  <div class="flex items-start gap-2 rounded-2 bg-secondary p-2.5">
                    <Avatar pubkey={state().pubkey} size="tiny" />
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                      <AuthorNames pubkey={state().pubkey} size="compact" />
                      <Show when={props.target}>
                        {(target) => (
                          <p class="c-secondary line-clamp-2 break-anywhere text-caption">
                            {hiddenUnderWarning(target())
                              ? warningLabel(target())
                              : target().content}
                          </p>
                        )}
                      </Show>
                    </div>
                  </div>
                  <fieldset
                    class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
                    disabled={state().phase === "sending"}
                  >
                    <div class="flex flex-col gap-1">
                      <span class="c-secondary text-caption">何を</span>
                      <SegmentedControl
                        block
                        label="何をミュートするか"
                        options={KIND_OPTIONS}
                        value={state().kind}
                        onChange={(value) =>
                          dispatch({ type: "chat-mute/kind", value })
                        }
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <span class="c-secondary text-caption">どこで</span>
                      <SegmentedControl
                        block
                        label="どこでミュートするか"
                        options={SCOPE_OPTIONS}
                        value={state().scope}
                        onChange={(value) =>
                          dispatch({ type: "chat-mute/scope", value })
                        }
                      />
                    </div>
                  </fieldset>
                  <p class="text-body">{bodyOf(state().kind, state().scope)}</p>
                  <Show when={state().scope === "channel"}>
                    <p class="c-secondary text-caption">
                      ミュートしたことは公開され、ほかの人の画面でも畳まれることがあります。
                    </p>
                    <TextField
                      label="理由（任意）"
                      value={state().reason}
                      onInput={(value) =>
                        dispatch({ type: "chat-mute/reason", value })
                      }
                      placeholder="例：宣伝"
                    />
                  </Show>
                </DialogBody>
                <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
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
