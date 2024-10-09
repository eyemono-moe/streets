import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import { useReactionsOfEvent } from "../../../libs/rxQuery";
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
          content: parsed.emoji
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
            <button
              class="b-1 b-zinc-2 flex w-fit appearance-none items-center gap-1 rounded bg-transparent p-0.5"
              type="button"
            >
              <div class="i-material-symbols:add-rounded c-zinc-5 aspect-square h-5 w-auto" />
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default Reactions;
