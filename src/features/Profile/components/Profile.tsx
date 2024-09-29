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
    <div class="text-zinc-9 p-2 grid grid-rows-[auto_minmax(0,1fr)] gap-2 h-full max-h-inherit text-4">
      <div class="grid gap-2 grid-cols-[auto_1fr]">
        <Image
          class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-12 h-auto aspect-square shrink-0 rounded bg-zinc-2"
          fallbackDelay={0}
        >
          <Image.Img
            src={profile.data?.picture}
            alt={profile.data?.name}
            class="object-cover w-full h-full"
          />
          <Image.Fallback class="w-full h-full flex items-center justify-center">
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
