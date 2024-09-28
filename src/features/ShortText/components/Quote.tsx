import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import { dateHuman, diffHuman } from "../../../libs/format";
import { parseTextContent } from "../../../libs/parseTextContent";
import ProfileHoverContent from "../../Profile/components/ProfileHoverContent";
import { useQueryProfile, useQueryProfiles } from "../../Profile/query";
import { useQueryShortTextById } from "../query";
import ShortTextContent from "./ShortTextContent";

const Quote: Component<{
  id?: string;
}> = (props) => {
  const text = useQueryShortTextById(() => props.id);

  const parsedContents = createMemo(() =>
    text.data ? parseTextContent(text.data) : [],
  );

  const replyTargetPubkeys = createMemo(
    () =>
      text.data?.tags
        .filter((tag) => tag.kind === "p")
        .map((tag) => tag.pubkey) ?? [],
  );
  const replyTargetQueries = useQueryProfiles(() => replyTargetPubkeys());

  const profile = useQueryProfile(() => text.data?.pubkey);
  const diff = () =>
    text.data?.created_at
      ? diffHuman(new Date(text.data?.created_at * 1000))()
      : "";

  return (
    <div>
      <HoverCard>
        <Show when={replyTargetPubkeys().length > 0}>
          <div class="ml-[calc(1rem-1px)] b-dashed b-l-2 mr-2 py-2 pl-2 text-80% text-zinc-5 flex flex-col gap-2">
            {/* TODO: リプライツリーの全体表示 */}
            <div>リプライを読み込む</div>
            <div>
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
          </div>
        </Show>
        <div
          class="text-zinc-9 grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-2 text-80%"
          style={{
            "grid-template-areas": `
            "image name"
            "image content"
          `,
          }}
        >
          <div class="grid-area-[image]">
            <HoverCard.Trigger>
              <Image
                class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-8 h-auto aspect-square rounded bg-zinc-2"
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
                    text.data?.pubkey.slice(0, 2)}
                </Image.Fallback>
              </Image>
            </HoverCard.Trigger>
          </div>
          <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
            <div class="truncate">
              <HoverCard.Trigger class="cursor-pointer hover:(underline)">
                <span>{profile.data?.display_name ?? "..."}</span>
                <span class="text-80% text-zinc-5">
                  @{profile.data?.name ?? text.data?.pubkey}
                </span>
              </HoverCard.Trigger>
            </div>
            <span
              class="text-80% text-zinc-5"
              title={
                text.data?.created_at
                  ? dateHuman(new Date(text.data?.created_at * 1000))
                  : ""
              }
            >
              {diff()}
            </span>
          </div>
          <div class="grid-area-[content] text-125%">
            <ShortTextContent contents={parsedContents()} />
          </div>
        </div>
        <HoverCard.Portal>
          <ProfileHoverContent pubkey={text.data?.pubkey} />
        </HoverCard.Portal>
      </HoverCard>
    </div>
  );
};

export default Quote;
