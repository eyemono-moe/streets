import {
  type Component,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useI18n } from "../../../i18n";
import { showLoginModal } from "../../../shared/libs/nostrLogin";
import { useFollowees, useSendContacts } from "../../../shared/libs/query";
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

  const { sendContacts, sendState: followSendState } = useSendContacts();
  const isLoading = () =>
    myFollowees().isInvalidated || followSendState.sending;

  const handleFollow = (e: MouseEvent) => {
    e.stopPropagation();

    if (!isLogged()) {
      showLoginModal();
      return;
    }

    const prevFollowees = myFollowees().data;
    const _myPubkey = myPubkey();

    if (!props.pubkey || !prevFollowees || !_myPubkey) {
      return;
    }

    if (isFollowing()) {
      const newFollowees = prevFollowees.parsed.followees
        .map((f) => f.pubkey)
        .filter((f) => f !== props.pubkey);

      sendContacts({
        content: prevFollowees.parsed.content,
        newFollowees,
        pubkey: _myPubkey,
      });
    } else {
      const newFollowees = prevFollowees.parsed.followees
        .map((f) => f.pubkey)
        .concat([props.pubkey]);

      sendContacts({
        content: prevFollowees.parsed.content,
        newFollowees,
        pubkey: _myPubkey,
      });
    }
  };

  const [hover, setHover] = createSignal(false);

  return (
    <button
      type="button"
      disabled={isLoading()}
      class="inline-flex w-14ch cursor-pointer appearance-none items-center justify-center gap-1 rounded-full py-1 font-700"
      classList={{
        "bg-zinc-9 text-white hover:bg-zinc-8": !isFollowing(),
        "b-1 bg-white text-zinc-9 hover:(b-red-3 bg-red-1/50 c-red-7)":
          isFollowing(),
        "op-50 cursor-progress": isLoading(),
      }}
      onClick={handleFollow}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Switch fallback={t("profile.follow")}>
        <Match when={!isLogged()}>{t("profile.follow")}</Match>
        <Match when={isFollowing()}>
          <Show when={hover()} fallback={t("profile.following")}>
            {t("profile.unfollow")}
          </Show>
        </Match>
      </Switch>
    </button>
  );
};

export default FollowButton;
