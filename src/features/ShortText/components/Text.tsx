import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import { dateHuman, dateTimeHuman } from "../../../libs/format";
import { parseTextContent } from "../../../libs/parseTextContent";
import { useOpenUserColumn } from "../../Column/libs/useOpenUserColumn";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile } from "../../Profile/query";
import type { parseShortTextNote } from "../event";
import { useQueryReactions, useQueryReposts } from "../query";
import EmbedUser from "./EmbedUser";
import Reply from "./Reply";
import ShortTextContent from "./ShortTextContent";

const Text: Component<{
  shortText: ReturnType<typeof parseShortTextNote>;
  showActions?: boolean;
  showReply?: boolean;
  small?: boolean;
  isReplyTarget?: boolean;
  showQuotes?: boolean;
}> = (props) => {
  const profile = useQueryProfile(() => props.shortText.pubkey);
  const openUserColumn = useOpenUserColumn();

  const replyTargetPubkeys = createMemo(
    () =>
      props.shortText.tags
        .filter((tag) => tag.kind === "p")
        .map((tag) => tag.pubkey) ?? [],
  );

  // TODO: 別ファイルに切り出す?
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

  const reposts = useQueryReposts(() => props.shortText.id);

  // TODO: 別コンポーネントに切り出し?
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
    <div
      classList={{
        "text-4": !props.small,
        "text-3.5": props.small,
      }}
    >
      <Show when={textType() === "reply" && props.showReply}>
        <Show
          when={!props.isReplyTarget}
          fallback={
            <div class="b-l-2 b-dashed ml-[calc(1rem-1px)] py-1 pl-2 text-zinc-5">
              load more
            </div>
          }
        >
          <Reply id={replyOrRoot()?.id} />
          <div class="b-l-2 ml-[calc(1rem-1px)] h-4" />
        </Show>
      </Show>
      <HoverCard>
        <div
          class="grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-x-2 gap-y-1"
          style={{
            "grid-template-areas": `
            "avatar name"
            "avatar content"
            ${parsedReactions().length > 0 ? '"avatar reaction"' : ""}
            ${props.showActions ? '"avatar actions"' : ""}
            `,
          }}
        >
          {/* TODO: ユーザーページへのリンクにする */}
          <div class="grid-area-[avatar] grid grid-rows-[auto_1fr]">
            <HoverCard.Trigger
              class="cursor-pointer appearance-none bg-transparent"
              as="button"
              onClick={() => {
                openUserColumn(props.shortText.pubkey);
              }}
            >
              <Image
                class="inline-flex aspect-square h-auto select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
                classList={{
                  "w-10": !props.small,
                  "w-6": props.small,
                }}
                fallbackDelay={500}
              >
                <Image.Img
                  src={profile.data?.picture}
                  alt={profile.data?.name}
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
                <Image.Fallback class="flex h-full w-full items-center justify-center">
                  {profile.data?.name.slice(0, 2) ??
                    props.shortText.pubkey.slice(0, 2)}
                </Image.Fallback>
              </Image>
            </HoverCard.Trigger>
            <Show when={props.isReplyTarget}>
              <div class="b-l-2 ml-[calc(1rem-1px)]" />
            </Show>
          </div>
          <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
            <div class="truncate">
              {/* TODO: ユーザーページへのリンクにする */}
              <HoverCard.Trigger
                class="cursor-pointer appearance-none bg-transparent hover:underline"
                as="button"
                onClick={() => {
                  openUserColumn(props.shortText.pubkey);
                }}
              >
                <Show when={profile.data} fallback={props.shortText.pubkey}>
                  <span>{profile.data?.display_name}</span>
                  <span class="text-3.5 text-zinc-5">
                    @{profile.data?.name}
                  </span>
                </Show>
              </HoverCard.Trigger>
            </div>
            <span
              class="text-3.5 text-zinc-5"
              title={dateHuman(new Date(props.shortText.created_at * 1000))}
            >
              {dateTimeHuman(new Date(props.shortText.created_at * 1000))}
            </span>
          </div>
          <div class="grid-area-[content]">
            <Show when={textType() === "mention" || textType() === "reply"}>
              <div class="text-3">
                <For each={replyTargetPubkeys()}>
                  {/* TODO: ユーザーページへのリンクにする */}
                  {(target, i) => (
                    <>
                      <Show when={i() !== 0}>
                        <span>, </span>
                      </Show>
                      <EmbedUser pubkey={target} />
                    </>
                  )}
                </For>
              </div>
            </Show>
            <ShortTextContent contents={parsedContents()} showLinkEmbeds />
          </div>
          <Show when={parsedReactions().length > 0}>
            <div class="grid-area-[reaction] flex flex-wrap gap-1">
              <For each={parsedReactions()}>
                {(reaction) => (
                  <button
                    class="b-1 b-zinc-2 flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                    type="button"
                  >
                    <div class="flex h-5 items-center justify-center">
                      <Show
                        when={
                          reaction.content.type === "emoji" && reaction.content
                        }
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
                    <span class="h-5 text-zinc-5 leading-5">
                      {reaction.count}
                    </span>
                  </button>
                )}
              </For>
              <button
                class="b-1 b-zinc-2 flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                type="button"
              >
                <div class="i-material-symbols:add-rounded c-zinc-5 aspect-square h-5 w-auto" />
              </button>
            </div>
          </Show>

          <Show when={props.showActions}>
            <div class="grid-area-[actions]">
              <div class="c-zinc-5 flex w-full max-w-100 items-center justify-between">
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:mode-comment-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:repeat-rounded aspect-square h-4 w-auto" />
                  <span>{reposts.data?.length || ""}</span>
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:add-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:bookmark-outline-rounded aspect-square h-4 w-auto" />
                </button>
                <button
                  class="flex appearance-none items-center gap-1 rounded bg-transparent p-0.5"
                  type="button"
                >
                  <div class="i-material-symbols:more-horiz aspect-square h-4 w-auto" />
                </button>
              </div>
            </div>
          </Show>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={props.shortText.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default Text;
