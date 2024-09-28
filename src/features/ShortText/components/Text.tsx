import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import { dateHuman, diffHuman } from "../../../libs/format";
import { parseTextContent } from "../../../libs/parseTextContent";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile, useQueryProfiles } from "../../Profile/query";
import type { parseShortTextNote } from "../event";
import { useQueryReactions } from "../query";
import Reply from "./Reply";
import ShortTextContent from "./ShortTextContent";

const Text: Component<{
  shortText: ReturnType<typeof parseShortTextNote>;
  repostBy?: string;
}> = (props) => {
  const profile = useQueryProfile(() => props.shortText.pubkey);
  const diff = diffHuman(new Date(props.shortText.created_at * 1000));

  const replyTargetPubkeys = createMemo(
    () =>
      props.shortText.tags
        .filter((tag) => tag.kind === "p")
        .map((tag) => tag.pubkey) ?? [],
  );
  const replyTargetQueries = useQueryProfiles(() => replyTargetPubkeys());

  const replyOrRoot = createMemo(() => {
    const reply = props.shortText.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "reply",
    );
    const root = props.shortText.tags.find(
      (tag): tag is EventTag => tag.kind === "e" && tag.marker === "root",
    );

    return reply ?? root;
  });

  const parsedContents = createMemo(() => parseTextContent(props.shortText));

  const textType = () => {
    // e tagがあればreply
    if (replyOrRoot()) return "reply";
    // p tagのみがあればmention
    if (replyTargetPubkeys().length > 0) return "mention";
    return "normal";
  };
  const reposterProfile = useQueryProfile(() => props.repostBy);

  const reactions = useQueryReactions(() => props.shortText.id);
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
    <div class="p-2">
      <Show when={props.repostBy}>
        <div class="text-80% text-zinc-5 pb-2">
          <HoverCard>
            <div class="flex items-center gap-1">
              <div class="i-material-symbols:repeat-rounded w-4 h-auto aspect-square c-green" />
              <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                <Show when={reposterProfile.data} fallback={props.repostBy}>
                  <span>{reposterProfile.data?.display_name}</span>
                  <span class="text-80% text-zinc-5">
                    @{reposterProfile.data?.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
              <span>がリポスト</span>
            </div>
            <HoverCard.Portal>
              <ProfileHoverContent pubkey={props.repostBy} />
            </HoverCard.Portal>
          </HoverCard>
        </div>
      </Show>
      <Show when={textType() === "reply"}>
        <Reply id={replyOrRoot()?.id} />
        <div class="ml-[calc(1rem-1px)] b-l-2 mr-2 pt-4 pb-2 pl-2 text-80% text-zinc-5">
          {"To "}
          <For each={replyTargetQueries}>
            {/* TODO: ユーザーページへのリンクにする */}
            {(target, i) => (
              <>
                <Show when={i() !== 0}>
                  <span>, </span>
                </Show>
                <HoverCard>
                  <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                    @{target.data?.name ?? replyTargetPubkeys()[i()]}
                  </HoverCard.Trigger>
                  <HoverCard.Portal>
                    <ProfileHoverContent pubkey={target.data?.pubkey} />
                  </HoverCard.Portal>
                </HoverCard>
              </>
            )}
          </For>
        </div>
      </Show>
      {/* TODO: embeddingsの有無を見てareaを変える */}
      <HoverCard>
        <div
          class="text-zinc-9 grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-2"
          style={{
            "grid-template-areas": `
            "avatar name"
            "avatar content"
            ${parsedReactions().length > 0 ? '"avatar reaction"' : ""}
            `,
          }}
        >
          {/* TODO: ユーザーページへのリンクにする */}
          <HoverCard.Trigger class="grid-area-[avatar] cursor-pointer">
            <Image
              class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-12 h-auto aspect-square rounded bg-zinc-2"
              fallbackDelay={500}
            >
              <Image.Img
                src={profile.data?.picture}
                alt={profile.data?.name}
                loading="lazy"
                class="object-cover w-full h-full"
              />
              <Image.Fallback class="w-full h-full flex items-center justify-center">
                {profile.data?.name.slice(0, 2) ??
                  props.shortText.pubkey.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </HoverCard.Trigger>
          <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
            <div class="truncate">
              {/* TODO: ユーザーページへのリンクにする */}
              <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                <Show when={profile.data} fallback={props.shortText.pubkey}>
                  <span>{profile.data?.display_name}</span>
                  <span class="text-80% text-zinc-5">
                    @{profile.data?.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
            </div>
            <span
              class="text-80% text-zinc-5"
              title={dateHuman(new Date(props.shortText.created_at * 1000))}
            >
              {diff()}
            </span>
          </div>
          <div class="grid-area-[content]">
            <Show when={textType() === "mention"}>
              <div class="text-80% text-zinc-5 pb-2">
                <For each={replyTargetQueries}>
                  {/* TODO: ユーザーページへのリンクにする */}
                  {(target, i) => (
                    <>
                      <Show when={i() !== 0}>
                        <span>, </span>
                      </Show>
                      <HoverCard>
                        <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                          @{target.data?.name ?? replyTargetPubkeys()[i()]}
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <ProfileHoverContent pubkey={target.data?.pubkey} />
                        </HoverCard.Portal>
                      </HoverCard>
                    </>
                  )}
                </For>
              </div>
            </Show>
            <ShortTextContent contents={parsedContents()} />
          </div>
          <Show when={parsedReactions().length > 0}>
            <div class="grid-area-[reaction] flex gap-1 flex-wrap">
              <For each={parsedReactions()}>
                {(reaction) => (
                  <button
                    class="appearance-none bg-transparent p-0.5 b-1 b-zinc-2 rounded flex items-center gap-1"
                    type="button"
                  >
                    <div class="h-5 flex items-center justify-center">
                      <Show
                        when={
                          reaction.content.type === "emoji" && reaction.content
                        }
                        fallback={
                          <span class="h-5 leading-5 truncate">
                            {reaction.content.value}
                          </span>
                        }
                      >
                        {(emoji) => (
                          <img
                            src={emoji().src}
                            class="h-full w-auto inline-block"
                            alt={emoji().value}
                          />
                        )}
                      </Show>
                    </div>
                    <span class="text-zinc-5 h-5 leading-5">
                      {reaction.count}
                    </span>
                  </button>
                )}
              </For>
              <button
                class="appearance-none bg-transparent p-0.5 b-1 b-zinc-2 rounded flex items-center gap-1"
                type="button"
              >
                <div class="i-material-symbols:add-rounded h-5 w-auto aspect-square c-zinc-5" />
              </button>
            </div>
          </Show>
          {/* TODO: actions */}
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.shortText.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default Text;
