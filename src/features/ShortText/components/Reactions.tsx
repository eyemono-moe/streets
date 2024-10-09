import { Popover } from "@kobalte/core/popover";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import EmojiPicker, { type Emoji } from "../../../components/EmojiPicker";
import { showLoginModal } from "../../../libs/nostrLogin";
import { useReactionsOfEvent, useSendReaction } from "../../../libs/rxQuery";
import { isLogged } from "../../../libs/useMyPubkey";
import type { ReactionButtonProps } from "./ReactionButton";
import ReactionButton from "./ReactionButton";

const Reactions: Component<{
  eventId: string;
  eventPubkey: string;
}> = (props) => {
  const [expand, setExpand] = createSignal(false);

  const reactions = useReactionsOfEvent(() => props.eventId);
  const parsedReactions = createMemo(() => {
    const reactionMap = reactions().data?.reduce<
      Map<string, ReactionButtonProps["reaction"]>
    >((acc, { parsed }) => {
      if (!acc.has(parsed.content)) {
        acc.set(parsed.content, {
          count: 0,
          users: [],
          content:
            parsed.emoji && `:${parsed.emoji.name}:` === parsed.content
              ? {
                  type: "emoji",
                  src: parsed.emoji.url,
                  value: parsed.content,
                }
              : { type: "string", value: parsed.content },
        });
      }

      const current = acc.get(parsed.content);
      if (!current) return acc;

      acc.set(parsed.content, {
        count: current.count + 1,
        users: [...current.users, parsed.pubkey],
        content: current.content,
      });

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
              type: "string",
              value: e.native,
            }
          : {
              type: "emoji",
              value: `:${e.name}:`,
              src: e.src,
            },
      kind: 1,
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
          <For each={parsedReactions()}>
            {(reaction) => (
              <ReactionButton
                eventId={props.eventId}
                eventPubkey={props.eventPubkey}
                reaction={reaction}
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

export default Reactions;
