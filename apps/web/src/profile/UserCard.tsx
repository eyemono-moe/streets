import { profileLabel, shortNpub } from "@streets/core/nostr/profile";
import { type Component, Show, createSignal } from "solid-js";
import { StreetSign } from "../../../../packages/sign/src/StreetSign";
import { useProfile } from "../note/use-profile";
import FollowButton from "./FollowButton";

/**
 * 名前やアイコンに触れたときに出す名刺。kind:0 に載っていることだけを出す ——
 * 触れただけでフォロー数のような別の購読を増やすと、流し読みで通信が膨らむ。
 * 続きはカードを押してユーザーのカラムを開いてもらう。
 */
const UserCard: Component<{ pubkey: string }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);
  const banner = () => (bannerBroken() ? undefined : profile()?.banner);
  const picture = () => (pictureBroken() ? undefined : profile()?.picture);

  return (
    <div class="flex w-80 max-w-[calc(100vw-2rem)] flex-col">
      <div class="h-22 shrink-0 overflow-hidden bg-secondary">
        <Show when={banner()}>
          {(url) => (
            <img
              src={url()}
              alt=""
              loading="lazy"
              class="size-full object-cover"
              onError={() => setBannerBroken(true)}
            />
          )}
        </Show>
      </div>
      {/* アイコンはヘッダー画像に重ねる。上へ 24px 引き上げて、その分を下で戻す。 */}
      <div class="-mt-6 flex flex-col gap-2 px-3 pb-3">
        <div class="flex items-end justify-between gap-2">
          <div class="size-14 shrink-0 overflow-hidden rounded-2 border-3 border-white bg-secondary dark:border-ui-950">
            <Show
              when={picture()}
              fallback={
                <StreetSign
                  name={props.pubkey}
                  class="size-full object-cover"
                />
              }
            >
              {(url) => (
                <img
                  src={url()}
                  alt=""
                  loading="lazy"
                  class="size-full object-cover"
                  onError={() => setPictureBroken(true)}
                />
              )}
            </Show>
          </div>
          <FollowButton pubkey={props.pubkey} size="small" />
        </div>
        <div class="flex min-w-0 flex-col">
          <span class="c-primary truncate font-600 text-body">
            {profileLabel(profile(), props.pubkey)}
          </span>
          <span class="c-secondary truncate text-caption">
            @{profile()?.name ?? shortNpub(props.pubkey)}
          </span>
        </div>
        <Show when={profile()?.about}>
          {(about) => (
            <p class="c-secondary break-anywhere line-clamp-3 whitespace-pre-wrap text-caption">
              {about()}
            </p>
          )}
        </Show>
      </div>
    </div>
  );
};

export default UserCard;
