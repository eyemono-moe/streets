import { type Component, Show, createSignal } from "solid-js";
import { useInvalidateEventCache } from "../../../context/eventCache";
import { useI18n } from "../../../i18n";
import { useFollowers } from "../../../shared/libs/query";
import { useOpenFollowersColumn } from "../../Column/libs/useOpenColumn";

const FollowerCounter: Component<{ pubkey?: string }> = (props) => {
  const t = useI18n();

  const [showFollowerCount, setShowFollowerCount] = createSignal(false);
  const followers = useFollowers(() =>
    showFollowerCount() ? props.pubkey : undefined,
  );
  const openFollowers = useOpenFollowersColumn();
  const invalidate = useInvalidateEventCache();

  const handleFollowerCountClick = () => {
    if (!showFollowerCount()) {
      invalidate(["followers", props.pubkey]);
      setShowFollowerCount(true);
      return;
    }
    if (props.pubkey) openFollowers(props.pubkey);
  };

  return (
    <button
      class="inline-flex w-fit appearance-none items-center gap-1 bg-transparent hover:underline"
      type="button"
      onClick={handleFollowerCountClick}
    >
      <Show
        when={showFollowerCount()}
        fallback={<span class="font-500">{t("profile.loadFollowers")}</span>}
      >
        <div>
          <span class="font-500">{followers().data?.length ?? 0}+</span>
          <span class="c-secondary ml-1 text-caption">
            {t("profile.followers")}
          </span>
        </div>
      </Show>
    </button>
  );
};

export default FollowerCounter;
