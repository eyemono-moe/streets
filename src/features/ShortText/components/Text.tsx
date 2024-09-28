import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { parseReferences } from "nostr-tools";
import { type Component, For, Show, createMemo } from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import { dateHuman, diffHuman } from "../../../libs/format";
import { parseTextContent } from "../../../libs/parseTextContent";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile, useQueryProfiles } from "../../Profile/query";
import type { parseShortTextNote } from "../event";
import Reply from "./Reply";
import ShortTextContent from "./ShortTextContent";

const Text: Component<{
  shortText: ReturnType<typeof parseShortTextNote>;
  repostBy?: string;
}> = (props) => {
  const profile = useQueryProfile(() => props.shortText.pubkey);
  const diff = diffHuman(new Date(props.shortText.created_at * 1000));

  const replyTargetsQuery = useQueryProfiles(() =>
    props.shortText.tags
      .filter((tag) => tag.kind === "p")
      .map((tag) => tag.pubkey),
  );
  const replyTargets = createMemo(() =>
    Array.from(replyTargetsQuery.data?.values() ?? []),
  );
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

  const quoteTargetIDs = createMemo(() => {
    const fromTag = props.shortText.tags
      .filter((t) => t.kind === "q")
      .map((t) => t.id);

    const references = props.shortText.raw
      ? parseReferences(props.shortText.raw)
      : [];
    const fromRef = references
      .map((e) => e.event?.id)
      .filter((id): id is string => !!id);

    return Array.from(new Set([...fromTag, ...fromRef]));
  });

  const hasEmbeddings = createMemo(() => quoteTargetIDs().length > 0);

  const textType = () => {
    // e tagがあればreply
    if (replyOrRoot()) return "reply";
    // p tagのみがあればmention
    if (replyTargets().length > 0) return "mention";
    return "normal";
  };
  const reposterProfile = useQueryProfile(() => props.repostBy);

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
          <For each={replyTargets()}>
            {/* TODO: ユーザーページへのリンクにする */}
            {(target, i) => (
              <>
                <Show when={i() !== 0}>
                  <span>, </span>
                </Show>
                <HoverCard>
                  <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                    @{target.name}
                  </HoverCard.Trigger>
                  <HoverCard.Portal>
                    <ProfileHoverContent pubkey={target.pubkey} />
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
            ${hasEmbeddings() ? '"avatar embeddings"' : ""}
            "action action"
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
                <For each={replyTargets()}>
                  {/* TODO: ユーザーページへのリンクにする */}
                  {(target) => (
                    <span class="not-last:after:(content-[',_'])">
                      @{target.display_name}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <ShortTextContent contents={parsedContents()} />
          </div>
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
