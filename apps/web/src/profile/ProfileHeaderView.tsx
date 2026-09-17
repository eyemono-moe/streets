import { profileLabel, shortNpub } from "@streets/core/nostr/profile";
import { type Component, Show, createSignal } from "solid-js";
import { useProfile } from "../note/use-profile";
import FollowButton from "./FollowButton";

const Count: Component<{
  count: number;
  label: string;
  /** 取得できたぶんしか数えられないとき、数の後ろに付ける。 */
  suffix?: string;
  title?: string;
  onOpen?: () => void;
}> = (props) => (
  <button
    type="button"
    class="flex items-baseline gap-1 bg-transparent text-caption enabled:cursor-pointer enabled:hover:underline"
    title={props.title}
    disabled={props.onOpen === undefined}
    onClick={() => props.onOpen?.()}
  >
    <span class="c-primary font-600">
      {props.count}
      {props.suffix}
    </span>
    <span class="c-secondary">{props.label}</span>
  </button>
);

/** ユーザーのカラムの先頭。プロフィールとフォローの操作を置く。 */
const ProfileHeaderView: Component<{
  pubkey: string;
  followeeCount: number;
  followerCount: number;
  onOpenFollowees?: () => void;
  onOpenFollowers?: () => void;
}> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);
  const banner = () => (bannerBroken() ? undefined : profile()?.banner);
  const picture = () => (pictureBroken() ? undefined : profile()?.picture);

  return (
    <section class="flex flex-col border-primary border-b bg-primary">
      <div class="h-28 shrink-0 overflow-hidden bg-secondary">
        <Show when={banner()}>
          {(url) => (
            <img
              src={url()}
              alt=""
              class="size-full object-cover"
              onError={() => setBannerBroken(true)}
            />
          )}
        </Show>
      </div>
      {/* アイコンはヘッダー画像に重ねる。上へ 32px 引き上げて、その分を下で戻す。 */}
      <div class="-mt-8 flex flex-col gap-3 px-3 pb-3">
        <div class="flex items-end justify-between gap-2">
          <div class="size-20 shrink-0 overflow-hidden rounded-3 border-3 border-white bg-secondary dark:border-ui-950">
            <Show when={picture()}>
              {(url) => (
                <img
                  src={url()}
                  alt=""
                  class="size-full object-cover"
                  onError={() => setPictureBroken(true)}
                />
              )}
            </Show>
          </div>
          <FollowButton pubkey={props.pubkey} />
        </div>
        <div class="flex flex-col">
          <h3 class="c-primary break-anywhere font-600 text-h3">
            {profileLabel(profile(), props.pubkey)}
          </h3>
          <p class="c-secondary break-anywhere text-caption">
            @{profile()?.name ?? shortNpub(props.pubkey)}
          </p>
        </div>
        <Show when={profile()?.about}>
          {(about) => (
            <p class="c-primary break-anywhere whitespace-pre-wrap text-caption">
              {about()}
            </p>
          )}
        </Show>
        <div class="flex gap-4">
          <Count
            count={props.followeeCount}
            label="フォロー"
            onOpen={props.onOpenFollowees}
          />
          <Count
            count={props.followerCount}
            label="フォロワー"
            suffix="+"
            title="対応リレーから取得できた人数"
            onOpen={props.onOpenFollowers}
          />
        </div>
      </div>
    </section>
  );
};

export default ProfileHeaderView;
