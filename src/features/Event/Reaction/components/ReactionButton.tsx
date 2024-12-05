import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import { useMe } from "../../../../context/me";
import { showLoginModal } from "../../../../shared/libs/nostrLogin";
import type { Reaction } from "../../../../shared/libs/parser/7_reaction";
import { useSendReaction } from "../../../../shared/libs/query";
import EmbedUser from "../../../User/components/EmbedUser";

export type ReactionButtonProps = {
  eventId: string;
  eventPubkey: string;
  showUsers?: boolean;
  users: Map<string, number>;
  reaction: Reaction["content"];
};

const ReactionButton: Component<ReactionButtonProps> = (props) => {
  const [{ myPubkey, isLogged }] = useMe();

  const isReacted = createMemo(() => {
    const _myPubkey = myPubkey();
    return !!_myPubkey && !!props.users.has(_myPubkey);
  });
  const reactionCount = createMemo(() =>
    Array.from(props.users.values()).reduce((acc, v) => acc + v, 0),
  );

  const { sendReaction, sendState } = useSendReaction();
  const isSending = () => sendState.sending && !sendState.successAny;

  const handleReaction = async () => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    // TODO: 複数回リアクションを送信できるようにする?
    if (isReacted()) return;

    await sendReaction({
      targetEventId: props.eventId,
      targetEventPubkey: props.eventPubkey,
      content: props.reaction,
      kind: 1,
    });
  };

  return (
    <div class="flex items-start gap-1">
      <button
        class="line-height-[1] b-1 inline-flex shrink-0 appearance-none items-center gap-1 rounded p-0.5 disabled:cursor-progress"
        classList={{
          "bg-transparent active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover":
            !isReacted(),
          "b-1 b-accent-5 bg-accent-5/10": isReacted(),
        }}
        type="button"
        title={
          props.reaction.type === "emoji"
            ? props.reaction.name
            : props.reaction.type === "text"
              ? props.reaction.content
              : undefined
        }
        disabled={isSending()}
        onClick={handleReaction}
      >
        <div class="flex h-5 items-center justify-center">
          <Switch>
            <Match
              when={props.reaction.type === "emoji" && props.reaction}
              keyed
            >
              {(emoji) => (
                <img
                  src={emoji.url}
                  class="inline-block h-full w-auto"
                  alt={emoji.name}
                />
              )}
            </Match>
            <Match
              when={props.reaction.type === "text" && props.reaction}
              keyed
            >
              {(textReaction) => (
                <span class="h-5 truncate leading-5">
                  {textReaction.content}
                </span>
              )}
            </Match>
            <Match when={props.reaction.type === "like"}>
              <div class="i-material-symbols:favorite-rounded c-accent-5 aspect-square h-5 w-auto" />
            </Match>
          </Switch>
        </div>
        <span class="c-secondary h-5 leading-5">{reactionCount()}</span>
      </button>
      <Show when={props.showUsers}>
        <span class="c-secondary text-caption">
          <For each={Array.from(props.users.entries())}>
            {([user, count], i) => (
              <>
                <Show when={i() !== 0}>
                  <span>, </span>
                </Show>
                <EmbedUser class="c-secondary text-caption" pubkey={user} />{" "}
                <Show when={count > 1}>({count})</Show>
              </>
            )}
          </For>
        </span>
      </Show>
    </div>
  );
};

export default ReactionButton;
