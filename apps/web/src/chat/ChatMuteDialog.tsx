import type { NostrEvent } from "@streets/core/nostr/event";
import type {
  ChatMuteKind,
  ChatMuteScope,
  ChatMuteState,
} from "@streets/core/view/chat-mute";
import { type Component, Show } from "solid-js";
import { t } from "../i18n/locale";
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

const kindOptions = () =>
  [
    { value: "message", label: t("chat.mute.kind.message") },
    { value: "user", label: t("chat.mute.kind.user") },
  ] as const;

const scopeOptions = () =>
  [
    { value: "channel", label: t("chat.mute.scope.channel") },
    { value: "everywhere", label: t("chat.mute.scope.everywhere") },
  ] as const;

const bodyOf = (kind: ChatMuteKind, scope: ChatMuteScope): string => {
  if (scope === "everywhere")
    return kind === "message"
      ? t("chat.mute.body.everywhereMessage")
      : t("chat.mute.body.everywhereUser");
  return kind === "message"
    ? t("chat.mute.body.channelMessage")
    : t("chat.mute.body.channelUser");
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
                    {t("chat.mute.title")}
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
                      <span class="c-secondary text-caption">
                        {t("chat.mute.kind.title")}
                      </span>
                      <SegmentedControl
                        block
                        label={t("chat.mute.kind.label")}
                        options={kindOptions()}
                        value={state().kind}
                        onChange={(value) =>
                          dispatch({ type: "chat-mute/kind", value })
                        }
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <span class="c-secondary text-caption">
                        {t("chat.mute.scope.title")}
                      </span>
                      <SegmentedControl
                        block
                        label={t("chat.mute.scope.label")}
                        options={scopeOptions()}
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
                      {t("chat.mute.public")}
                    </p>
                    <TextField
                      label={t("chat.mute.reason.label")}
                      value={state().reason}
                      onInput={(value) =>
                        dispatch({ type: "chat-mute/reason", value })
                      }
                      placeholder={t("chat.mute.reason.placeholder")}
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
                    {t("chat.mute.cancel")}
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
                    <Show
                      when={state().phase !== "sending"}
                      fallback={t("chat.mute.sending")}
                    >
                      {t("chat.mute.submit")}
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
