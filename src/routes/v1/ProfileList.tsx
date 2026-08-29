import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import type { SectionStatus } from "../../core/read/source";
import { useRender } from "../../core/view/render-context";
import Avatar from "./Avatar";
import FollowButton from "./FollowButton";
import NoteContent from "./NoteContent";
import Profile from "./Profile";
import { followeesFrom } from "./follow-state";
import { useProfileData } from "./profile-data";

const ProfileRow: Component<{ pubkey: string }> = (props) => {
  const render = useRender();
  const profile = useProfileData(
    () => props.pubkey,
    render.store,
    render.profiles,
  );
  return (
    <li class="flex gap-3 p-3">
      <Avatar pubkey={props.pubkey} size="full" />
      <div class="min-w-0 flex-1 space-y-1">
        <Profile
          pubkey={props.pubkey}
          store={render.store}
          requests={render.profiles}
          variant="author"
        />
        <Show when={profile()?.about}>
          {(about) => (
            <p class="break-anywhere c-secondary line-clamp-3 text-sm">
              <NoteContent
                content={about()}
                tags={profile()?.tags ?? []}
                variant="compact"
                eventRefs="text"
              />
            </p>
          )}
        </Show>
      </div>
      <FollowButton pubkey={props.pubkey} />
    </li>
  );
};

const ProfileList: Component<{
  kind: "followees-list" | "followers-list";
  items: () => readonly NostrEvent[];
  status: () => SectionStatus;
}> = (props) => {
  const pubkeys = createMemo(() => {
    if (props.kind === "followees-list") return followeesFrom(props.items()[0]);
    return [...new Set(props.items().map((event) => event.pubkey))];
  });
  return (
    <div>
      <Show when={props.kind === "followers-list"}>
        <p class="c-secondary border-b bg-alpha-50 px-3 py-2 text-xs">
          フォロワーは対応リレーから取得できた範囲を表示します。
        </p>
      </Show>
      <Show
        when={pubkeys().length > 0}
        fallback={
          <Show
            when={props.status().incomplete}
            fallback={
              <Show when={props.status().phase === "settled"}>
                <p class="c-secondary p-3 text-sm">
                  該当するユーザーはいません。
                </p>
              </Show>
            }
          >
            <p role="alert" class="p-3 text-red-7 text-sm dark:text-red-4">
              一覧を取得できませんでした。接続を確認して、カラムを開き直してください。
            </p>
          </Show>
        }
      >
        <ul class="divide-y">
          <For each={pubkeys()}>
            {(pubkey) => <ProfileRow pubkey={pubkey} />}
          </For>
        </ul>
      </Show>
    </div>
  );
};

export default ProfileList;
