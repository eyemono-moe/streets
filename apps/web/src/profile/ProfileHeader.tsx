import {
  buildFolloweesColumn,
  buildFollowersColumn,
} from "@streets/core/deck/column-presets";
import {
  followeesFrom,
  followersFrom,
  followsPubkey,
} from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, createMemo } from "solid-js";
import { useEventActions } from "../actions";
import { useDispatch } from "../ui-events";
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
  const viewer = useEventActions()?.viewer;
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
  // フォロー数のために読んでいる kind:3 をそのまま使う。別に聞き直さない。
  const followsYou = () =>
    viewer !== undefined &&
    viewer !== props.pubkey &&
    followsPubkey(followees.items()[0], viewer) === true;

  return (
    <ProfileHeaderView
      pubkey={props.pubkey}
      followeeCount={followeeCount()}
      followerCount={followerCount()}
      followsYou={followsYou()}
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
  );
};

export default ProfileHeader;
