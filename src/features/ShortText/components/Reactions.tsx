import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useReactionsOfEvent } from "../../../libs/rxQuery";
import EmbedUser from "./EmbedUser";

const Reactions: Component<{
  eventId: string;
}> = (props) => {
  const [expand, setExpand] = createSignal(false);

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
              <div class="flex items-start gap-1">
                <button
                  class="b-1 b-zinc-2 flex w-fit appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="flex h-5 items-center justify-center">
                    <Switch
                      fallback={
                        <span class="h-5 truncate leading-5">
                          {reaction.content.value}
                        </span>
                      }
                    >
                      <Match
                        when={
                          reaction.content.type === "emoji" && reaction.content
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
                          reaction.content.type === "string" &&
                          reaction.content.value === "+"
                        }
                      >
                        <div class="i-material-symbols:favorite-rounded c-pink aspect-square h-5 w-auto" />
                      </Match>
                    </Switch>
                  </div>
                  <span class="h-5 text-zinc-5 leading-5">
                    {reaction.count}
                  </span>
                </button>
                <Show when={expand()}>
                  <span>
                    <For each={reaction.users}>
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
