import { Image } from "@kobalte/core/image";
import { type Component, Show, createMemo } from "solid-js";
import { hex2bech32 } from "../../../libs/bech32";
import { parseTextContent } from "../../../libs/parseTextContent";
import ShortTextContent from "../../ShortText/components/ShortTextContent";
import { useQueryProfile } from "../query";

// TODO: fallbackでskeletonを表示する

const Profile: Component<{
  pubkey?: string;
}> = (props) => {
  const profile = useQueryProfile(() => props.pubkey);
  const parsedContents = createMemo(() =>
    profile.data ? parseTextContent(profile.data) : [],
  );

  return (
    <div class="grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 text-4 text-zinc-9">
      <div class="grid grid-cols-[auto_1fr] gap-2">
        <Image
          class="inline-flex aspect-square h-auto w-12 shrink-0 select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
          fallbackDelay={0}
        >
          <Image.Img
            src={profile.data?.picture}
            alt={profile.data?.name}
            class="h-full w-full object-cover"
          />
          <Image.Fallback class="flex h-full w-full items-center justify-center">
            {profile.data?.name.slice(0, 2) ?? props.pubkey?.slice(0, 2)}
          </Image.Fallback>
        </Image>
        <div class="overflow-hidden">
          <span>{profile.data?.display_name ?? "..."}</span>
          <span class="text-3.5 text-zinc-5">
            @{profile.data?.name ?? "..."}
          </span>
          <div class="truncate">
            <Show when={profile.data?.pubkey} fallback="nostr1...">
              {(pubkey) => hex2bech32(pubkey())}
            </Show>
          </div>
        </div>
      </div>
      <div class="overflow-y-auto">
        <ShortTextContent contents={parsedContents()} />
      </div>
    </div>
  );
};

export default Profile;
