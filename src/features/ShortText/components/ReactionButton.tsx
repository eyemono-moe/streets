import { type Component, For, Match, Show, Switch, createMemo } from "solid-js";
import { showLoginModal } from "../../../libs/nostrLogin";
import { useSendReaction } from "../../../libs/rxQuery";
import { isLogged, useMyPubkey } from "../../../libs/useMyPubkey";
import EmbedUser from "./EmbedUser";

export type ReactionButtonProps = {
  eventId: string;
  eventPubkey: string;
  showUsers?: boolean;
  reaction: {
    count: number;
    /** user pubkey */
    users: string[];
    content:
      | {
          type: "string";
          value: string;
        }
      | {
          type: "emoji";
          value: string;
          src: string;
        };
  };
};

const ReactionButton: Component<ReactionButtonProps> = (props) => {
  const myPubkey = useMyPubkey();

  const isReacted = createMemo(() => {
    const _myPubkey = myPubkey();
    return !!_myPubkey && props.reaction.users.includes(_myPubkey);
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
      content: props.reaction.content,
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
        title={props.reaction.content.value}
        disabled={sendState.sending}
        onClick={handleReaction}
      >
        <div class="flex h-5 items-center justify-center">
          <Switch
            fallback={
              <span class="h-5 truncate leading-5">
                {props.reaction.content.value}
              </span>
            }
          >
            <Match
              when={
                props.reaction.content.type === "emoji" &&
                props.reaction.content
              }
            >
              {(emoji) => (
                <img
                  src={emoji().src}
                  class="inline-block h-full w-auto"
                  alt={emoji().value}
                />
              )}
            </Match>
            <Match
              when={
                props.reaction.content.type === "string" &&
                props.reaction.content.value === "+"
              }
            >
              <div class="i-material-symbols:favorite-rounded c-purple aspect-square h-5 w-auto" />
            </Match>
          </Switch>
        </div>
        <span class="h-5 text-zinc-5 leading-5">{props.reaction.count}</span>
      </button>
      <Show when={props.showUsers}>
        <span>
          <For each={props.reaction.users}>
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
