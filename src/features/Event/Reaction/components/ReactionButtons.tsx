import { Popover } from "@kobalte/core/popover";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import EmojiPicker, {
  type Emoji,
} from "../../../../shared/components/EmojiPicker";
import { showLoginModal } from "../../../../shared/libs/nostrLogin";
import {
  useReactionsOfEvent,
  useSendReaction,
} from "../../../../shared/libs/query";
import { isLogged } from "../../../../shared/libs/useMyPubkey";
import ReactionButton, { type ReactionButtonProps } from "./ReactionButton";

const ReactionButtons: Component<{
  eventId: string;
  eventPubkey: string;
  eventKind: number;
}> = (props) => {
  const [expand, setExpand] = createSignal(false);

  const reactions = useReactionsOfEvent(() => props.eventId);
  const groupedReactions = createMemo(() => {
    const reactionMap = reactions().data?.reduce<
      Map<
        string,
        {
          reaction: ReactionButtonProps["reaction"];
          users: ReactionButtonProps["users"];
        }
      >
    >((acc, { parsed }) => {
      const contentKey =
        parsed.content.type === "emoji"
          ? parsed.content.name
          : parsed.content.type === "text"
            ? parsed.content.content
            : "+";

      if (!acc.has(contentKey)) {
        acc.set(contentKey, {
          users: [parsed.pubkey],
          reaction: parsed.content,
        });
        return acc;
      }
      const current = acc.get(contentKey);
      if (!current) return acc;

      current.users.push(parsed.pubkey);

      return acc;
    }, new Map());

    return Array.from(reactionMap?.values() ?? []);
  });

  // TODO: Text.tsxとの共通化
  const { sendReaction } = useSendReaction();
  const handleReaction = async (e: Emoji) => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (!e.native && !e.src) {
      console.error("emoji src is not found");
      return;
    }

    await sendReaction({
      targetEventId: props.eventId,
      targetEventPubkey: props.eventPubkey,
      content:
        e.native !== undefined
          ? {
              type: "text",
              content: e.native,
            }
          : {
              type: "emoji",
              name: e.name,
              url: e.src,
            },
      kind: props.eventKind,
    });
  };

  return (
    <Show when={(reactions().data?.length ?? 0) > 0}>
      <div class="parent relative">
        <button
          class="absolute top-0.25 left-0 flex parent-not-hover:hidden aspect-square h-6 w-auto translate-x--100% appearance-none items-center gap-1 rounded bg-transparent"
          type="button"
          onClick={() => setExpand((prev) => !prev)}
        >
          <div
            class="i-material-symbols:arrow-drop-down-rounded c-zinc-5 h-full w-full transition-transform"
            classList={{
              "rotate-180deg": expand(),
            }}
          />
        </button>
        <div
          class="flex flex-wrap gap-1"
          classList={{
            "flex-col": expand(),
          }}
        >
          <For each={groupedReactions()}>
            {(reactionGroup) => (
              <ReactionButton
                eventId={props.eventId}
                eventPubkey={props.eventPubkey}
                reaction={reactionGroup.reaction}
                users={reactionGroup.users}
                showUsers={expand()}
              />
            )}
          </For>
          <Show when={(reactions().data?.length ?? 0) > 0 && !expand()}>
            <Popover>
              <Popover.Trigger class="b-1 b-zinc-2 flex w-fit appearance-none items-center gap-1 rounded bg-transparent p-0.5 hover:bg-zinc-1/50">
                <div class="i-material-symbols:add-rounded c-zinc-5 aspect-square h-5 w-auto" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="transform-origin-[var(--kb-popover-content-transform-origin)] z-50 outline-none">
                  <EmojiPicker
                    onSelect={(v) => {
                      handleReaction(v);
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ReactionButtons;
