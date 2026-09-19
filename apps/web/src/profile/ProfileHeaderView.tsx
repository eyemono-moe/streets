import { parseContent } from "@streets/core/nostr/content";
import { type Profile, shortNpub } from "@streets/core/nostr/profile";
import { type Component, type JSX, Show, createSignal } from "solid-js";
import { ProfileName, ProfileText } from "../note/Name";
import NoteText from "../note/NoteText";
import { useProfileDetails } from "../note/use-profile";
import Avatar from "../ui/Avatar";
import FollowButton from "./FollowButton";
import ProfileMenu from "./ProfileMenu";

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

/**
 * プロフィールの見た目。ユーザーのカラムの先頭と、設定での書きかけの見本が同じ
 * ものを使う（見本が本物とずれない）。操作（フォロー）と数は置き場所ごとに渡す。
 */
export const ProfileHeaderCard: Component<{
  pubkey: string;
  profile: Profile | undefined;
  /** kind:0 のタグ。名前と自己紹介にある NIP-30 絵文字を解決する。 */
  profileTags?: readonly string[][];
  /** アイコンの右に置く操作。 */
  action?: JSX.Element;
  /** 自己紹介の下に置くもの（フォロー・フォロワーの数）。 */
  footer?: JSX.Element;
}> = (props) => {
  // 壊れた URL を覚えておく。URL が変わったら（設定で書き換えたら）もう一度試す。
  const [bannerBroken, setBannerBroken] = createSignal<string>();
  const banner = () => {
    const url = props.profile?.banner;
    return url && url !== bannerBroken() ? url : undefined;
  };
  const tags = () => props.profileTags ?? [];

  return (
    <section class="flex flex-col border-primary border-b bg-primary">
      <div class="h-28 shrink-0 overflow-hidden bg-secondary">
        <Show when={banner()}>
          {(url) => (
            <img
              src={url()}
              alt=""
              class="size-full object-cover"
              onError={() => setBannerBroken(url())}
            />
          )}
        </Show>
      </div>
      {/* アイコンはヘッダー画像に重ねる。上へ 32px 引き上げて、その分を下で戻す。 */}
      <div class="-mt-8 flex flex-col gap-3 px-3 pb-3">
        <div class="flex min-h-20 items-end justify-between gap-2">
          <Avatar
            pubkey={props.pubkey}
            picture={props.profile?.picture}
            loading="eager"
            class="size-20 rounded-3 border-3 border-white dark:border-ui-950"
          />
          {props.action}
        </div>
        <div class="flex flex-col">
          <h3 class="c-primary break-anywhere font-600 text-h3">
            <ProfileName
              pubkey={props.pubkey}
              profile={props.profile}
              tags={tags()}
            />
          </h3>
          <p class="c-secondary break-anywhere text-caption">
            @
            <ProfileText
              text={props.profile?.name ?? shortNpub(props.pubkey)}
              tags={tags()}
            />
          </p>
        </div>
        <Show when={props.profile?.about}>
          {(about) => (
            <NoteText
              tokens={parseContent(about(), tags())}
              class="c-primary text-caption"
              emojiClass="h-[1em]"
            />
          )}
        </Show>
        {props.footer}
      </div>
    </section>
  );
};

/** ユーザーのカラムの先頭。プロフィールとフォローの操作を置く。 */
const ProfileHeaderView: Component<{
  pubkey: string;
  followeeCount: number;
  followerCount: number;
  onOpenFollowees?: () => void;
  onOpenFollowers?: () => void;
}> = (props) => {
  const details = useProfileDetails(() => props.pubkey);
  return (
    <ProfileHeaderCard
      pubkey={props.pubkey}
      profile={details()?.profile}
      profileTags={details()?.tags}
      action={
        <div class="flex items-center gap-1.5">
          <FollowButton pubkey={props.pubkey} />
          <ProfileMenu pubkey={props.pubkey} />
        </div>
      }
      footer={
        <div class="flex flex-wrap items-center gap-4">
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
      }
    />
  );
};

export default ProfileHeaderView;
