import { type Component, Show, createMemo, createSignal } from "solid-js";
import type { SubscriptionManager } from "../../core/read/subscription-manager";
import { createSection } from "../../core/solid/create-section";
import { useRender } from "../../core/view/render-context";
import FollowButton from "./FollowButton";
import NoteContent from "./NoteContent";
import { useColumnNavigation } from "./column-navigation";
import { followeesFrom } from "./follow-state";
import { npubLabel } from "./npub-label";
import { useProfileData } from "./profile-data";

const UserProfilePanel: Component<{
  pubkey: string;
  manager: SubscriptionManager;
}> = (props) => {
  const render = useRender();
  const navigation = useColumnNavigation();
  const profile = useProfileData(
    () => props.pubkey,
    render.store,
    render.profiles,
  );
  const [bannerBroken, setBannerBroken] = createSignal(false);
  const [pictureBroken, setPictureBroken] = createSignal(false);
  const followeesSection = createSection({
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], authors: [props.pubkey], limit: 1 }],
    }),
    manager: props.manager,
  });
  const followersSection = createSection({
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], "#p": [props.pubkey] }],
    }),
    manager: props.manager,
  });
  const followeeCount = createMemo(
    () => followeesFrom(followeesSection.items()[0]).length,
  );
  const followerCount = createMemo(
    () => new Set(followersSection.items().map((event) => event.pubkey)).size,
  );
  const displayName = () =>
    profile()?.displayName || profile()?.name || npubLabel(props.pubkey);

  return (
    <section data-testid="user-profile" class="border-b">
      <div class="mb--8 h-28 overflow-hidden bg-secondary">
        <Show when={profile()?.banner && !bannerBroken()}>
          <img
            src={profile()?.banner}
            alt=""
            class="h-full w-full object-cover"
            onError={() => setBannerBroken(true)}
          />
        </Show>
      </div>
      <div class="space-y-3 px-3 pb-3">
        <div class="flex items-end justify-between gap-2">
          <div class="h-20 w-20 overflow-hidden rounded-full border-3 border-base bg-secondary">
            <Show when={profile()?.picture && !pictureBroken()}>
              <img
                src={profile()?.picture}
                alt=""
                class="h-full w-full object-cover"
                onError={() => setPictureBroken(true)}
              />
            </Show>
          </div>
          <FollowButton pubkey={props.pubkey} />
        </div>
        <div>
          <h3 class="break-anywhere font-700 text-h3">{displayName()}</h3>
          <Show when={profile()?.displayName && profile()?.name}>
            <p class="c-secondary break-anywhere text-caption">
              @{profile()?.name}
            </p>
          </Show>
        </div>
        <Show when={profile()?.about}>
          {(about) => (
            <p class="break-anywhere text-body">
              <NoteContent
                content={about()}
                tags={profile()?.tags ?? []}
                variant="compact"
                eventRefs="text"
              />
            </p>
          )}
        </Show>
        <div class="flex gap-4 text-sm">
          <button
            type="button"
            class="enabled:cursor-pointer enabled:hover:underline"
            onClick={() => navigation.openFollowees(props.pubkey)}
          >
            <span class="font-700">{followeeCount()}</span>{" "}
            <span class="c-secondary">フォロー</span>
          </button>
          <button
            type="button"
            class="enabled:cursor-pointer enabled:hover:underline"
            title="対応リレーから取得できた人数"
            onClick={() => navigation.openFollowers(props.pubkey)}
          >
            <span class="font-700">{followerCount()}+</span>{" "}
            <span class="c-secondary">フォロワー</span>
          </button>
        </div>
      </div>
      <div class="border-t px-3 py-2 font-700 text-sm">ノート</div>
    </section>
  );
};

export default UserProfilePanel;
