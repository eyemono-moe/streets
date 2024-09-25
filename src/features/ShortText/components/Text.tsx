import { HoverCard } from "@kobalte/core/hover-card";
import { Image } from "@kobalte/core/image";
import { type Component, createMemo } from "solid-js";
import { dateHuman, diffHuman } from "../../../libs/format";
import { pickLatestEvent } from "../../../libs/latestEvent";
import Profile from "../../Profile/components/Profile";
import { useQueryProfile } from "../../Profile/query";
import type { parseShortTextNote } from "../event";

const Text: Component<{
  shortText: ReturnType<typeof parseShortTextNote>;
}> = (props) => {
  const profile = useQueryProfile(() => props.shortText.pubkey);
  const latestProfile = createMemo(() => pickLatestEvent(profile.data ?? []));

  const diff = diffHuman(new Date(props.shortText.created_at * 1000));

  return (
    <HoverCard>
      <div
        class="text-zinc-9 p-2 grid grid-cols-[auto_1fr] grid-cols-[auto_1fr] gap-2"
        style={{
          "grid-template-areas": `
        "image name"
        "image content"
        `,
        }}
      >
        <HoverCard.Trigger class="grid-area-[image]">
          <Image
            class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-12 h-auto aspect-square rounded bg-zinc-2"
            fallbackDelay={500}
          >
            <Image.Img
              src={latestProfile()?.picture}
              alt={latestProfile()?.name}
              loading="lazy"
            />
            <Image.Fallback class="w-full h-full flex items-center justify-center">
              {latestProfile()?.name.slice(0, 2)}
            </Image.Fallback>
          </Image>
        </HoverCard.Trigger>
        <div class="grid-area-[name] grid grid-cols-[1fr_auto]">
          <div class="truncate">
            <HoverCard.Trigger>
              <span>{latestProfile()?.display_name ?? "..."}</span>
              <span class="text-80% text-zinc-5">
                @{latestProfile()?.name ?? "..."}
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
        <pre class="grid-area-[content] whitespace-pre-wrap break-anywhere">
          {props.shortText.content}
        </pre>
        {/* TODO: embeddings */}
        {/* TODO: actions */}
      </div>
      <HoverCard.Portal>
        <HoverCard.Content class="max-w-[min(calc(100vw-32px),360px)] shadow-xl transform-origin-[--kb-hovercard-content-transform-origin] rounded-2 overflow-hidden">
          <HoverCard.Arrow />
          <div class="bg-white">
            <Profile pubkey={latestProfile()?.pubkey} />
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard>
  );
};

export default Text;
