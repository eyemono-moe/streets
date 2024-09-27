import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import type { EventTag } from "../../../libs/commonTag";
import { dateHuman, diffHuman } from "../../../libs/format";
import Profile from "../../Profile/components/Profile";
import { useQueryProfile, useQueryProfiles } from "../../Profile/query";
import type { parseShortTextNote } from "../event";
import Reply from "./Reply";

const Text: Component<{
  shortText: ReturnType<typeof parseShortTextNote>;
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

  const textType = () => {
    // e tagがあればreply
    if (replyOrRoot()) return "reply";
    // p tagのみがあればmention
    if (replyTargets().length > 0) return "mention";
    return "normal";
  };

  return (
    <HoverCard>
      <div class="p-2">
        <Show when={textType() === "reply"}>
          <Reply id={replyOrRoot()?.id} />
          <div class="ml-[calc(1rem-1px)] b-l-2 mr-2 pt-4 pb-2 pl-2 text-80% text-zinc-5">
            <For each={replyTargets()}>
              {/* TODO: ユーザーページへのリンクにする */}
              {(target) => (
                <span class="not-last:after:(content-[',_'])">
                  @{target.display_name}
                </span>
              )}
            </For>
            への返信
          </div>
        </Show>
        <div
          class="text-zinc-9 grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-2"
          style={{
            "grid-template-areas": `
            "image name"
            "image content"
            `,
          }}
        >
          {/* TODO: ユーザーページへのリンクにする */}
          <HoverCard.Trigger class="grid-area-[image] cursor-pointer">
            <Image
              class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-12 h-auto aspect-square rounded bg-zinc-2"
              fallbackDelay={500}
            >
              <Image.Img
                src={profile.data?.picture}
                alt={profile.data?.name}
                loading="lazy"
              />
              <Image.Fallback class="w-full h-full flex items-center justify-center">
                {profile.data?.name.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </HoverCard.Trigger>
          <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
            <div class="truncate">
              {/* TODO: ユーザーページへのリンクにする */}
              <HoverCard.Trigger class="cursor-pointer">
                <span>{profile.data?.display_name ?? "..."}</span>
                <span class="text-80% text-zinc-5">
                  @{profile.data?.name ?? props.shortText.pubkey}
                </span>
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
            <pre class="whitespace-pre-wrap break-anywhere">
              {props.shortText.content}
            </pre>
          </div>
          {/* TODO: embeddings */}
          {/* TODO: actions */}
          {/* <div class="grid-area-[action]">
            <Show when={props.shortText.tags.length > 0}>
              <pre class="text-80% text-zinc-5">
                {JSON.stringify(props.shortText.tags, null, 2)}
              </pre>
            </Show>
          </div> */}
        </div>
        <HoverCard.Portal>
          <HoverCard.Content class="max-w-[min(calc(100vw-32px),520px)] max-h-[min(calc(100vh-32px),520px)] shadow-xl transform-origin-[--kb-hovercard-content-transform-origin] rounded-2 overflow-auto">
            <HoverCard.Arrow />
            <div class="bg-white">
              <Profile pubkey={profile.data?.pubkey} />
            </div>
          </HoverCard.Content>
        </HoverCard.Portal>
      </div>
    </HoverCard>
  );
};

export default Text;
