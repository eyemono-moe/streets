import { Image } from "@kobalte/core/image";
import { type Component, Show, createMemo } from "solid-js";
import { hex2bech32 } from "../../../libs/bech32";
import { pickLatestEvent } from "../../../libs/latestEvent";
import { useQueryProfile } from "../query";

// TODO: fallbackでskeletonを表示する

const Profile: Component<{
  pubkey?: string;
}> = (props) => {
  const profile = useQueryProfile(() => props.pubkey);
  const latestProfile = createMemo(() => pickLatestEvent(profile.data ?? []));

  return (
    <div class="text-zinc-9 p-2 overflow-hidden flex flex-col gap-2">
      <div class="grid gap-2 grid-cols-[auto_1fr]">
        <Image
          class="inline-flex items-center justify-center align-mid overflow-hidden select-none w-12 h-auto aspect-square shrink-0 rounded bg-zinc-2"
          fallbackDelay={0}
        >
          <Image.Img
            src={latestProfile()?.picture}
            alt={latestProfile()?.name}
          />
          <Image.Fallback class="w-full h-full flex items-center justify-center">
            {latestProfile()?.name.slice(0, 2)}
          </Image.Fallback>
        </Image>
        <div class="overflow-hidden">
          <span>{latestProfile()?.display_name ?? "..."}</span>
          <span class="text-80% text-zinc-5">
            @{latestProfile()?.name ?? "..."}
          </span>
          <div class="truncate">
            <Show when={latestProfile()?.pubkey} fallback="nostr1...">
              {(pubkey) => hex2bech32(pubkey())}
            </Show>
          </div>
        </div>
      </div>
      <pre class="grid-area-[content] whitespace-pre-wrap break-anywhere">
        {latestProfile()?.about}
      </pre>
    </div>
  );
};

export default Profile;
