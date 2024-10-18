import { Image } from "@kobalte/core/image";
import { type Component, Show, createMemo } from "solid-js";
import { useMe } from "../../../context/me";
import { useI18n } from "../../../i18n";
import RichContent from "../../../shared/components/RichContents";
import { hex2bech32 } from "../../../shared/libs/format";
import { parseTextContent } from "../../../shared/libs/parseTextContent";
import { useFollowees, useProfile } from "../../../shared/libs/query";
import {
  useOpenFolloweesColumn,
  useOpenReactionsColumn,
} from "../../Column/libs/useOpenColumn";
import FollowButton from "./FollowButton";
import FollowerCounter from "./FollowerCounter";
import Nip05Badge from "./Nip05Badge";

// TODO: fallbackでskeletonを表示する

const Profile: Component<{
  pubkey?: string;
  small?: boolean;
}> = (props) => {
  const t = useI18n();

  const profile = useProfile(() => props.pubkey);

  const [{ myPubkey }] = useMe();
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

  return (
    <div class="relative grid h-full max-h-inherit grid-rows-[auto_minmax(0,1fr)]">
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
              "mt-32 mr-34": !props.small,
              "mt-24 mr-26": props.small,
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
              <Image.Fallback class="flex h-full w-full items-center justify-center bg-secondary">
                {profile().data?.parsed.name.slice(0, 2) ??
                  props.pubkey?.slice(0, 2)}
              </Image.Fallback>
            </Image>
          </div>
          <div>
            <FollowButton pubkey={props.pubkey} />
          </div>
        </div>
        <div class="flex flex-col">
          <span class="line-clamp-3 text-ellipsis font-700 text-h3">
            {profile().data?.parsed.display_name ??
              (props.pubkey
                ? hex2bech32(props.pubkey, "npub").slice(0, 12)
                : "...")}
          </span>
          <div>
            <span class="c-secondary truncate text-caption">
              @{profile().data?.parsed.name ?? "..."}
            </span>
            <Show when={isFollowed()}>
              <span class="c-secondary ml-1 rounded bg-secondary px-1 py-0.5 text-caption">
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
              <div class="i-material-symbols:link-rounded c-secondary aspect-square h-0.75lh w-auto" />
              <a
                href={profile().data?.parsed.website}
                target="_blank"
                rel="noopener noreferrer"
                class="truncate text-caption text-link underline"
              >
                {profile().data?.parsed.website}
              </a>
            </div>
          </Show>
        </div>
        <div class="overflow-y-auto">
          <RichContent contents={parsedContents()} />
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
                <span class="c-secondary ml-1 text-caption">
                  {t("profile.followees")}
                </span>
              </div>
            </button>
          </Show>
          <FollowerCounter pubkey={props.pubkey} />
          {/* TODO: ポスト一覧, リアクション一覧, メディア一覧等を出し分けるようにする */}
          <Show when={!props.small}>
            <button
              class="inline-flex w-fit appearance-none items-center gap-1 bg-transparent hover:underline"
              type="button"
              onClick={() => {
                if (props.pubkey) openReactionsColumn(props.pubkey);
              }}
            >
              <span class="font-500">{t("profile.reactions")}</span>
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Profile;
