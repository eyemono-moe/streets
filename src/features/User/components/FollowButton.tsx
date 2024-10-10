import { type Component, Match, Switch, createMemo } from "solid-js";
import { useI18n } from "../../../i18n";
import { showLoginModal } from "../../../shared/libs/nostrLogin";
import { useFollowees } from "../../../shared/libs/query";
import { isLogged, useMyPubkey } from "../../../shared/libs/useMyPubkey";

const FollowButton: Component<{ pubkey?: string }> = (props) => {
  const t = useI18n();

  const myPubkey = useMyPubkey();
  const myFollowees = useFollowees(myPubkey);
  const isFollowing = createMemo(() =>
    myFollowees().data?.parsed.followees.some(
      (pubkey) => pubkey.pubkey === props.pubkey,
    ),
  );
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
    <button
      type="button"
      disabled={isLogged() && isFollowing() === undefined}
      class="inline-flex cursor-pointer appearance-none items-center justify-center gap-1 rounded-full px-4 py-1 font-700"
      classList={{
        "bg-zinc-9 text-white hover:bg-zinc-8": isFollowing(),
        "b-1 bg-white text-zinc-9 hover:bg-zinc-1": !isFollowing(),
      }}
      onClick={handleFollow}
    >
      <Switch
        fallback={
          <>
            <div class="i-material-symbols:person-add-outline-rounded aspect-square h-1lh w-auto" />
            {t("profile.follow")}
          </>
        }
      >
        <Match when={!isLogged()}>
          <div class="i-material-symbols:person-add-outline-rounded aspect-square h-1lh w-auto" />
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
  );
};

export default FollowButton;
