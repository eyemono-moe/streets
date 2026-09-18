import { buildUserColumn } from "@streets/core/deck/column-presets";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Component, Show } from "solid-js";
import Avatar from "../note/Avatar";
import { useProfile } from "../note/use-profile";
import { useDispatch } from "../ui-events";
import FollowButton from "./FollowButton";

/** 一覧の 1 人。押すとその人のカラムを重ねる。 */
const ProfileRow: Component<{ pubkey: string }> = (props) => {
  const dispatch = useDispatch();
  const profile = useProfile(() => props.pubkey);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでカラムを開く経路はまだ無い（押せるのはポインタだけ）
    <div
      class="cursor-pointer bg-primary"
      onClick={(event) => {
        // ボタンの上で押したときは開かない。フォローだけしたい人を邪魔しない。
        if (
          event.target instanceof Element &&
          event.target.closest("button") !== null
        ) {
          return;
        }
        dispatch({ type: "stack/open", column: buildUserColumn(props.pubkey) });
      }}
    >
      {/*
        画面の外を飛ばすのは中身だけ。行そのものに当てると、下線が端数の位置で
        丸められて消えることがある。
      */}
      <div class="offscreen-skip flex items-start gap-3 px-3 py-2.5">
        <Avatar pubkey={props.pubkey} size="normal" />
        {/*
        名前・id・bio をできるだけ見せる（Penpot: Follow states の「改善案」）。
        名前と id は横幅いっぱいで切り、bio はボタンの下まで広げて 3 行で切る。
      */}
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex items-start gap-3">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="c-primary truncate font-600 text-body">
                {profileLabel(profile(), props.pubkey)}
              </span>
              <Show when={profile()?.displayName && profile()?.name}>
                {(name) => (
                  <span class="c-secondary truncate text-caption">
                    @{name()}
                  </span>
                )}
              </Show>
            </div>
            <FollowButton pubkey={props.pubkey} size="small" />
          </div>
          <Show when={profile()?.about}>
            {(about) => (
              <p class="c-secondary break-anywhere line-clamp-3 whitespace-pre-wrap text-caption">
                {about()}
              </p>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ProfileRow;
