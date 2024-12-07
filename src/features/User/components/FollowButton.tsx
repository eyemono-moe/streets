import {
  type Component,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from "solid-js";
import { useMe } from "../../../context/me";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import { showLoginModal } from "../../../shared/libs/nostrLogin";
import { useFollowees, useSendContacts } from "../../../shared/libs/query";

const FollowButton: Component<{ pubkey?: string }> = (props) => {
  const t = useI18n();

  const [{ myPubkey, isLogged }] = useMe();
  const myFollowees = useFollowees(myPubkey);
  const isFollowing = createMemo(() =>
    myFollowees().data?.parsed.followees.some(
      (pubkey) => pubkey.pubkey === props.pubkey,
    ),
  );

  const { sendContacts, sendState: followSendState } = useSendContacts();
  const isLoading = () =>
    myFollowees().isFetching ||
    myFollowees().isInvalidated ||
    followSendState.sending;

  const handleFollow = (e: MouseEvent) => {
    e.stopPropagation();

    if (!isLogged()) {
      showLoginModal();
      return;
    }

    if (isLoading()) {
      return;
    }

    const prevFolloweesData = myFollowees().data;
    const prevFollowees = prevFolloweesData?.parsed.followees || [];
    const _myPubkey = myPubkey();

    if (!props.pubkey || !_myPubkey) {
      return;
    }

    if (isFollowing()) {
      const newFollowees = prevFollowees
        .map((f) => f.pubkey)
        .filter((f) => f !== props.pubkey);

      sendContacts({
        content: prevFolloweesData?.parsed.content ?? "",
        newFollowees,
        pubkey: _myPubkey,
      });
    } else {
      const newFollowees = prevFollowees
        .map((f) => f.pubkey)
        .concat([props.pubkey]);

      sendContacts({
        content: prevFolloweesData?.parsed.content ?? "",
        newFollowees,
        pubkey: _myPubkey,
      });
    }
  };

  const [hover, setHover] = createSignal(false);

  return (
    <div class="w-16ch">
      <Button
        type="button"
        full
        disabled={isLoading()}
        onClick={handleFollow}
        variant={
          isFollowing() ? (hover() ? "dangerBorder" : "border") : "primary"
        }
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
      </Button>
    </div>
  );
};

export default FollowButton;
