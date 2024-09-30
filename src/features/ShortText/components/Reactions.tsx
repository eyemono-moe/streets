import { type Component, For, Show, createMemo } from "solid-js";
import { useQueryReactions } from "../query";

const Reactions: Component<{
  eventId: string;
}> = (props) => {
  const reactions = useQueryReactions(() => props.eventId);
  const parsedReactions = createMemo(() => {
    const reactionMap = reactions.data?.reduce<
      Map<
        string,
        {
          count: number;
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
        }
      >
    >((acc, reaction) => {
      if (!acc.has(reaction.content)) {
        acc.set(reaction.content, {
          count: 0,
          users: [],
          content: reaction.emoji
            ? {
                type: "emoji",
                src: reaction.emoji.url,
                value: reaction.emoji.name,
              }
            : { type: "string", value: reaction.content },
        });
      }

      const current = acc.get(reaction.content);
      if (!current) return acc;

      acc.set(reaction.content, {
        count: current.count + 1,
        users: [...current.users, reaction.pubkey],
        content: current.content,
      });

      return acc;
    }, new Map());

    return Array.from(reactionMap?.values() ?? []);
  });

  return (
    <div class="flex flex-wrap gap-1">
      <For each={parsedReactions()}>
        {(reaction) => (
          <button
            class="b-1 b-zinc-2 flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
            type="button"
          >
            <div class="flex h-5 items-center justify-center">
              <Show
                when={reaction.content.type === "emoji" && reaction.content}
                fallback={
                  <span class="h-5 truncate leading-5">
                    {reaction.content.value}
                  </span>
                }
              >
                {(emoji) => (
                  <img
                    src={emoji().src}
                    class="inline-block h-full w-auto"
                    alt={emoji().value}
                  />
                )}
              </Show>
            </div>
            <span class="h-5 text-zinc-5 leading-5">{reaction.count}</span>
          </button>
        )}
      </For>
      <Show when={(reactions.data?.length ?? 0) > 0}>
        <button
          class="b-1 b-zinc-2 flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
          type="button"
        >
          <div class="i-material-symbols:add-rounded c-zinc-5 aspect-square h-5 w-auto" />
        </button>
      </Show>
    </div>
  );
};

export default Reactions;
