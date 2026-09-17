import { buildUserColumn } from "@streets/core/deck/column-presets";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Component, Show } from "solid-js";
import { useColumnStack } from "../deck/column-stack";
import Avatar from "../note/Avatar";
import { useProfile } from "../note/use-profile";
import FollowButton from "./FollowButton";

/** 一覧の 1 人。押すとその人のカラムを重ねる。 */
const ProfileRow: Component<{ pubkey: string }> = (props) => {
  const stack = useColumnStack();
  const profile = useProfile(() => props.pubkey);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでカラムを開く経路はまだ無い（押せるのはポインタだけ）
    <div
      class="flex items-center gap-3 bg-primary p-3"
      classList={{ "cursor-pointer": stack !== undefined }}
      onClick={(event) => {
        // ボタンの上で押したときは開かない。フォローだけしたい人を邪魔しない。
        if (
          event.target instanceof Element &&
          event.target.closest("button") !== null
        ) {
          return;
        }
        stack?.push(buildUserColumn(props.pubkey));
      }}
    >
      <Avatar pubkey={props.pubkey} size="normal" />
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex min-w-0 items-end gap-1.5">
          <span class="c-primary truncate font-600 text-body">
            {profileLabel(profile(), props.pubkey)}
          </span>
          <Show when={profile()?.displayName && profile()?.name}>
            {(name) => (
              <span class="c-secondary min-w-0 truncate text-caption">
                @{name()}
              </span>
            )}
          </Show>
        </div>
        <p class="c-secondary truncate text-caption">
          {profile()?.about ?? "-"}
        </p>
      </div>
      <FollowButton pubkey={props.pubkey} size="small" />
    </div>
  );
};

export default ProfileRow;
