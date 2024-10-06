import { type Component, For, Show, createMemo } from "solid-js";
import { useReactionsOfEvent } from "../../../libs/rxQuery";

const Reactions: Component<{
  eventId: string;
}> = (props) => {
  const reactions = useReactionsOfEvent(() => props.eventId);
  const parsedReactions = createMemo(() => {
    const reactionMap = reactions().data?.reduce<
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
    >((acc, { parsed }) => {
      if (!acc.has(parsed.content)) {
        acc.set(parsed.content, {
          count: 0,
          users: [],
          content: parsed.emoji
            ? {
                type: "emoji",
                src: parsed.emoji.url,
                value: parsed.emoji.name,
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
        <Show when={(reactions().data?.length ?? 0) > 0}>
          <button
            class="b-1 b-zinc-2 flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
            type="button"
          >
            <div class="i-material-symbols:add-rounded c-zinc-5 aspect-square h-5 w-auto" />
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default Reactions;
