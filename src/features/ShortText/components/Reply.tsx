import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, For, Show, createMemo } from "solid-js";
import { dateHuman, diffHuman } from "../../../libs/format";
import Profile from "../../Profile/components/Profile";
import { useQueryProfile, useQueryProfiles } from "../../Profile/query";
import { useQueryShortTextById } from "../query";

const Reply: Component<{
  id?: string;
}> = (props) => {
  const text = useQueryShortTextById(() => props.id);

  const replyTargetsQuery = useQueryProfiles(() =>
    text.data?.tags.filter((tag) => tag.kind === "p").map((tag) => tag.pubkey),
  );
  const replyTargets = createMemo(() =>
    Array.from(replyTargetsQuery.data?.values() ?? []),
  );

  const profile = useQueryProfile(() => text.data?.pubkey);
  const diff = () =>
    text.data?.created_at
      ? diffHuman(new Date(text.data?.created_at * 1000))()
      : "";

  return (
    <div>
      <HoverCard>
        <div>
          <Show when={replyTargets().length > 0}>
            <div class="ml-[calc(1rem-1px)] b-dashed b-l-2 mr-2 py-2 pl-2 text-80% text-zinc-5 flex flex-col gap-2">
              {/* TODO: リプライツリーの全体表示 */}
              <div>リプライを読み込む</div>
              <div>
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
            <div class="grid-area-[image] grid grid-rows-[auto_1fr]">
              <HoverCard.Trigger>
                <Image
                  class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-8 h-auto aspect-square rounded bg-zinc-2"
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
              <div class="ml-[calc(1rem-1px)] b-l-2" />
            </div>
            <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
              <div class="truncate">
                <HoverCard.Trigger>
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
            <pre class="grid-area-[content] whitespace-pre-wrap break-anywhere">
              {text.data?.content}
            </pre>
          </div>
          <HoverCard.Portal>
            <HoverCard.Content class="max-w-[min(calc(100vw-32px),520px)] shadow-xl transform-origin-[--kb-hovercard-content-transform-origin] rounded-2 overflow-hidden">
              <HoverCard.Arrow />
              <div class="bg-white">
                <Profile pubkey={profile.data?.pubkey} />
              </div>
            </HoverCard.Content>
          </HoverCard.Portal>
        </div>
      </HoverCard>
    </div>
  );
};

export default Reply;
