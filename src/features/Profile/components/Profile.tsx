import { Image } from "@kobalte/core/image";
import { type Component, Match, Show, Switch, createMemo } from "solid-js";
import { useI18n } from "../../../i18n";
import { readablePubkey } from "../../../libs/format";
import { showLoginModal } from "../../../libs/nostrLogin";
import { parseTextContent } from "../../../libs/parseTextContent";
import { useFollowees, useProfile } from "../../../libs/rxQuery";
import { isLogged, useMyPubkey } from "../../../libs/useMyPubkey";
import {
  useOpenFolloweesColumn,
  useOpenReactionsColumn,
} from "../../Column/libs/useOpenColumn";
import ShortTextContent from "../../ShortText/components/ShortTextContent";
import Nip05Badge from "./Nip05Badge";

// TODO: fallbackでskeletonを表示する

const Profile: Component<{
  pubkey?: string;
  small?: boolean;
}> = (props) => {
  const t = useI18n();

  const profile = useProfile(() => props.pubkey);

  const myPubkey = useMyPubkey();
  const myFollowees = useFollowees(myPubkey);
  const isFollowing = createMemo(() =>
    myFollowees().data?.parsed.followees.some(
      (pubkey) => pubkey.pubkey === props.pubkey,
    ),
  );

  const followees = useFollowees(() => props.pubkey);
  const isFollowed = createMemo(() => {
    return followees().data?.parsed.followees.some(
      (pubkey) => pubkey.pubkey === myPubkey(),
    );
  });

  const openFolloweesColumn = useOpenFolloweesColumn();
  const openReactionsColumn = useOpenReactionsColumn();

  const parsedContents = createMemo(() => {
    const p = profile().data;
    if (p) return parseTextContent(p.parsed.about, []);
    return [];
  });

  const handleFollow = () => {
    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (isFollowing()) {
      // unfollow
    } else {
      // follow
    }
  };

  return (
    <div class="relative grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)] text-4">
      <Image
        // margin-bottom: アイコンの高さ(32/24)+padding(2)-ボタンの高さ(8)-ボタンとの距離(2)
        class="h-auto w-full select-none"
        fallbackDelay={0}
        classList={{
          "max-h-24 mb--16": props.small,
          "max-h-50 mb--24": !props.small,
        }}
      >
        <Image.Img
          src={profile().data?.parsed.banner}
          alt={`${profile().data?.parsed.name}'s banner`}
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </Image>
      <div class="flex w-full flex-col gap-1 overflow-hidden p-2">
        <div class="flex items-end justify-between">
          <div
            class="relative"
            classList={{
              "mt-32": !props.small,
              "mt-24": props.small,
            }}
          >
            <Image
              class="absolute bottom-0 inline-flex aspect-square w-auto shrink-0 select-none items-center justify-center overflow-hidden rounded align-mid"
              fallbackDelay={0}
              classList={{
                "h-32": !props.small,
                "h-24": props.small,
              }}
            >
              <Image.Img
                src={profile().data?.parsed.picture}
                alt={profile().data?.parsed.name}
                class="h-full w-full object-cover"
              />
              <Image.Fallback class="flex h-full w-full items-center justify-center bg-zinc-2">
                {profile().data?.parsed.name.slice(0, 2) ??
                  props.pubkey?.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </div>
          <div>
            <button
              type="button"
              disabled={isLogged() && isFollowing() === undefined}
              class="inline-flex cursor-pointer appearance-none items-center justify-center gap-1 rounded-full px-4 py-1 font-bold"
              classList={{
                "bg-zinc-9 text-white hover:bg-zinc-8": isFollowing(),
                "b-1 bg-white text-zinc-9 hover:bg-zinc-1": !isFollowing(),
              }}
              onClick={handleFollow}
            >
              <Switch
                fallback={
                  <>
                    <div class="i-material-symbols:person-add-outline-rounded aspect-square h-6 w-auto" />
                    {t("profile.follow")}
                  </>
                }
              >
                <Match when={!isLogged()}>
                  <div class="i-material-symbols:person-add-outline-rounded aspect-square h-6 w-auto" />
                  {t("profile.loginAndFollow")}
                </Match>
                <Match when={isFollowing() === undefined}>
                  <div class="flex items-center justify-center p-1">
                    <div class="b-2 b-zinc-3 b-r-violet aspect-square h-auto w-4 animate-spin rounded-full" />
                  </div>
                </Match>
                <Match when={isFollowing()}>{t("profile.following")}</Match>
              </Switch>
            </button>
          </div>
        </div>
        <div class="flex flex-col">
          <span class="line-clamp-3 text-ellipsis font-500 text-5">
            {profile().data?.parsed.display_name ??
              (props.pubkey ? readablePubkey(props.pubkey) : "...")}
          </span>
          <div>
            <span class="truncate text-3.5 text-zinc-5">
              @{profile().data?.parsed.name ?? "..."}
            </span>
            <Show when={isFollowed()}>
              <span class="ml-1 rounded bg-zinc-2 px-1 py-0.5 text-3 text-zinc-5">
                {t("profile.followsYou")}
              </span>
            </Show>
          </div>
        </div>
        <div class="flex w-full flex-wrap gap-2">
          <Show when={profile().data?.parsed.nip05}>
            <Nip05Badge pubkey={props.pubkey} />
          </Show>
          <Show when={profile().data?.parsed.website}>
            <div class="flex max-w-full items-center gap-1">
              <div class="i-material-symbols:link-rounded c-zinc-5 aspect-square h-4 w-auto" />
              <a
                href={profile().data?.parsed.website}
                target="_blank"
                rel="noopener noreferrer"
                class="c-blue-5 visited:c-violet-7 truncate text-3.5 underline"
              >
                {profile().data?.parsed.website}
              </a>
            </div>
          </Show>
        </div>
        <div class="overflow-y-auto">
          <ShortTextContent contents={parsedContents()} />
        </div>
        <div class="flex items-center gap-4">
          <Show when={followees().data}>
            <button
              class="inline-flex w-fit appearance-none items-center gap-1 bg-transparent hover:underline"
              type="button"
              onClick={() => {
                if (props.pubkey) openFolloweesColumn(props.pubkey);
              }}
            >
              <div>
                <span class="font-500">
                  {followees().data?.parsed.followees.length ?? 0}
                </span>
                <span class="ml-1 text-3.5 text-zinc-5">
                  {t("profile.followees")}
                </span>
              </div>
              <div class="i-material-symbols:add-column-right-outline-rounded aspect-square h-4 w-auto text-zinc-5" />
            </button>
          </Show>
          <Show when={!props.small}>
            <button
              class="inline-flex w-fit appearance-none items-center gap-1 bg-transparent hover:underline"
              type="button"
              onClick={() => {
                if (props.pubkey) openReactionsColumn(props.pubkey);
              }}
            >
              <span class="font-500">{t("profile.reactions")}</span>
              <div class="i-material-symbols:add-column-right-outline-rounded aspect-square h-4 w-auto text-zinc-5" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Profile;
