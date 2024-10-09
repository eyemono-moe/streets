import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import { showLoginModal } from "../../../../shared/libs/nostrLogin";
import type { Reaction } from "../../../../shared/libs/parser/7_reaction";
import { useSendReaction } from "../../../../shared/libs/query";
import { isLogged, useMyPubkey } from "../../../../shared/libs/useMyPubkey";
import EmbedUser from "../../../User/components/EmbedUser";

export type ReactionButtonProps = {
  eventId: string;
  eventPubkey: string;
  showUsers?: boolean;
  users: string[];
  reaction: Reaction["content"];
};

const ReactionButton: Component<ReactionButtonProps> = (props) => {
  const myPubkey = useMyPubkey();

  const isReacted = createMemo(() => {
    const _myPubkey = myPubkey();
    return !!_myPubkey && !!props.users.includes(_myPubkey);
  });

  const { sendReaction, sendState } = useSendReaction();
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
        class="b-1 flex w-fit appearance-none items-center gap-1 rounded p-0.5 disabled:cursor-progress disabled:opacity-50"
        classList={{
          "b-zinc-2 bg-transparent hover:bg-zinc-1/50": !isReacted(),
          "b-purple-6 bg-purple-6/10": isReacted(),
        }}
        type="button"
        title={
          props.reaction.type === "emoji"
            ? props.reaction.name
            : props.reaction.type === "text"
              ? props.reaction.content
              : undefined
        }
        disabled={sendState.sending}
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
              <div class="i-material-symbols:favorite-rounded c-purple aspect-square h-5 w-auto" />
            </Match>
          </Switch>
        </div>
        <span class="h-5 text-zinc-5 leading-5">{props.users.length}</span>
      </button>
      <Show when={props.showUsers}>
        <span>
          <For each={props.users}>
            {(user, i) => (
              <>
                <Show when={i() !== 0}>
                  <span>, </span>
                </Show>
                <EmbedUser class="text-3 text-zinc-5" pubkey={user} />
              </>
            )}
          </For>
        </span>
      </Show>
    </div>
  );
};

export default ReactionButton;
