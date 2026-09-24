import { parseContent } from "@streets/core/nostr/content";
import { shortNpub } from "@streets/core/nostr/profile";
import { type Component, Show, createSignal } from "solid-js";
import { ProfileName, ProfileText } from "../note/Name";
import NoteText from "../note/NoteText";
import { useProfileDetails } from "../note/use-profile";
import Avatar from "../ui/Avatar";
import FollowButton from "./FollowButton";
import FollowsYouBadge from "./FollowsYouBadge";
import { useFollowsYou } from "./follows-you";

/**
 * 名前やアイコンに触れたときに出す名刺。kind:0 に載っていることを出す ——
 * 触れただけでフォロー数のような別の購読を増やすと、流し読みで通信が膨らむ。
 * 例外は「フォローされています」で、自分を指す kind:3 を 1 件だけ、開いている
 * 間だけ聞く（`useFollowsYou`）。続きはカードを押してユーザーのカラムを開いてもらう。
 */
const UserCard: Component<{ pubkey: string }> = (props) => {
  const details = useProfileDetails(() => props.pubkey);
  const followsYou = useFollowsYou(() => props.pubkey);
  const profile = () => details()?.profile;
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const banner = () => (bannerBroken() ? undefined : profile()?.banner);

  return (
    <div class="flex w-80 max-w-[calc(100vw-2rem)] flex-col">
      <div class="h-22 shrink-0 overflow-hidden bg-secondary">
        <Show when={banner()}>
          {(url) => (
            <img
              src={url()}
              alt=""
              loading="lazy"
              decoding="async"
              class="size-full object-cover"
              onError={() => setBannerBroken(true)}
            />
          )}
        </Show>
      </div>
      {/* アイコンはヘッダー画像に重ねる。上へ 24px 引き上げて、その分を下で戻す。 */}
      <div class="-mt-6 flex flex-col gap-2 px-3 pb-3">
        <div class="flex items-end justify-between gap-2">
          <Avatar
            pubkey={props.pubkey}
            picture={profile()?.picture}
            class="size-14 rounded-2 border-3 border-white dark:border-ui-950"
          />
          <FollowButton pubkey={props.pubkey} size="small" />
        </div>
        <div class="flex min-w-0 flex-col">
          <span class="c-primary truncate font-600 text-body">
            <ProfileName
              pubkey={props.pubkey}
              profile={profile()}
              tags={details()?.tags}
            />
          </span>
          <span class="flex min-w-0 items-center gap-2">
            <span class="c-secondary min-w-0 truncate text-caption">
              @
              <ProfileText
                text={profile()?.name ?? shortNpub(props.pubkey)}
                tags={details()?.tags}
              />
            </span>
            <Show when={followsYou()}>
              <FollowsYouBadge />
            </Show>
          </span>
        </div>
        <Show when={profile()?.about}>
          {(about) => (
            <NoteText
              tokens={parseContent(about(), details()?.tags ?? [])}
              class="c-secondary line-clamp-3 text-caption"
              emojiClass="h-[1em]"
            />
          )}
        </Show>
      </div>
    </div>
  );
};

export default UserCard;
