import {
  buildFolloweesColumn,
  buildFollowersColumn,
} from "@streets/core/deck/column-presets";
import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";
import AuthorRelaysDialog from "./AuthorRelaysDialog";
import ProfileHeaderView from "./ProfileHeaderView";

/**
 * ユーザーのカラムの先頭。フォロー数・フォロワー数を押すと、その一覧を
 * このカラムの上に重ねる。
 */
const ProfileHeader: Component<{
  pubkey: string;
  readLayer: ReadLayer;
}> = (props) => {
  const dispatch = useDispatch();
  const [relaysOpen, setRelaysOpen] = createSignal(false);
  const followees = createSection({
    manager: props.readLayer.manager,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], authors: [props.pubkey], limit: 1 }],
    }),
  });
  const followers = createSection({
    manager: props.readLayer.manager,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], "#p": [props.pubkey] }],
    }),
  });

  const followeeCount = createMemo(
    () => followeesFrom(followees.items()[0]).length,
  );
  const followerCount = createMemo(
    () => followersFrom(followers.items()).length,
  );

  return (
    <>
      <ProfileHeaderView
        pubkey={props.pubkey}
        followeeCount={followeeCount()}
        followerCount={followerCount()}
        onOpenRelays={() => setRelaysOpen(true)}
        onOpenFollowees={() =>
          dispatch({
            type: "stack/open",
            column: buildFolloweesColumn(props.pubkey),
          })
        }
        onOpenFollowers={() =>
          dispatch({
            type: "stack/open",
            column: buildFollowersColumn(props.pubkey),
          })
        }
      />
      <Show when={relaysOpen()}>
        <AuthorRelaysDialog
          pubkey={props.pubkey}
          onClose={() => setRelaysOpen(false)}
        />
      </Show>
    </>
  );
};

export default ProfileHeader;
