import { Image } from "@kobalte/core/image";
import { type Component, Match, Show, Switch, createMemo } from "solid-js";
import { hex2bech32 } from "../../../libs/bech32";
import { parseTextContent } from "../../../libs/parseTextContent";
import { useProfile } from "../../../libs/rxQuery";
import { useMyPubkey } from "../../../libs/useMyPubkey";
import ShortTextContent from "../../ShortText/components/ShortTextContent";
import { useQueryFollowList } from "../../ShortText/query";

// TODO: fallbackでskeletonを表示する

const Profile: Component<{
  pubkey?: string;
  small?: boolean;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);

  const myPubkey = useMyPubkey();
  const followings = useQueryFollowList(myPubkey);
  const isFollowing = createMemo(() =>
    followings()?.some((pubkey) => pubkey === props.pubkey),
  );

  const parsedContents = createMemo(() => {
    const p = profile.data;
    if (p) return parseTextContent(p);
    return [];
  });

  return (
    <div class="relative grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)] text-4">
      <Image
        class="w-full select-none bg-zinc-2"
        fallbackDelay={0}
        classList={{
          "max-h-16": props.small,
        }}
      >
        <Image.Img
          src={profile.data?.parsed.banner}
          alt={`${profile.data?.parsed.name}'s banner`}
          class="h-full w-full object-cover"
        />
        <Image.Fallback class="flex h-full w-ful bg-zinc" />
      </Image>
      <div class="grid grid-rows-[auto_auto_minmax(0,1fr)] gap-1 p-2">
        <div class="flex items-end justify-between">
          <div class="relative">
            <Image
              class="bottom-0 inline-flex aspect-square w-auto shrink-0 select-none items-center justify-center overflow-hidden rounded bg-zinc-2 align-mid"
              fallbackDelay={0}
              classList={{
                absolute: profile.data?.parsed.banner !== undefined,
                "h-32": !props.small,
                "h-24": props.small,
              }}
            >
              <Image.Img
                src={profile.data?.parsed.picture}
                alt={profile.data?.parsed.name}
                class="h-full w-full object-cover"
              />
              <Image.Fallback class="flex h-full w-full items-center justify-center">
                {profile.data?.parsed.name.slice(0, 2) ??
                  props.pubkey?.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </div>
          <div>
            <button
              type="button"
              disabled={isFollowing() === undefined}
              class="inline-flex appearance-none items-center justify-center gap-1 rounded-full px-4 py-1 font-bold"
              classList={{
                "bg-zinc-9 text-white": isFollowing(),
                "b-1 bg-white text-zinc-9": !isFollowing(),
              }}
            >
              <Switch
                fallback={
                  <>
                    <div class="i-material-symbols:person-add-outline-rounded aspect-square h-6 w-auto" />
                    フォロー
                  </>
                }
              >
                <Match when={isFollowing() === undefined}>
                  <div class="flex items-center justify-center p-2">
                    <div class="b-4 b-zinc-3 b-r-violet aspect-square h-auto w-8 animate-spin rounded-full" />
                  </div>
                </Match>
                <Match when={isFollowing()}>フォロー中</Match>
              </Switch>
            </button>
          </div>
        </div>
        <div class="overflow-hidden">
          <span>{profile.data?.parsed.display_name ?? "..."}</span>
          <span class="text-3.5 text-zinc-5">
            @{profile.data?.parsed.name ?? "..."}
          </span>
          <div class="c-zinc-4 truncate text-3">
            <Show when={props.pubkey} fallback="nostr1...">
              {(pubkey) => hex2bech32(pubkey())}
            </Show>
          </div>
        </div>
        <div class="overflow-y-auto">
          <ShortTextContent contents={parsedContents()} />
        </div>
      </div>
    </div>
  );
};

export default Profile;
