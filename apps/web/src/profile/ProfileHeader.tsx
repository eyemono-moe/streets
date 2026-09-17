import {
  buildFolloweesColumn,
  buildFollowersColumn,
} from "@streets/core/deck/column-presets";
import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, createMemo } from "solid-js";
import { useColumnStack } from "../deck/column-stack";
import ProfileHeaderView from "./ProfileHeaderView";

/**
 * ユーザーのカラムの先頭。フォロー数・フォロワー数を押すと、その一覧を
 * このカラムの上に重ねる。
 */
const ProfileHeader: Component<{
  pubkey: string;
  readLayer: ReadLayer;
}> = (props) => {
  const stack = useColumnStack();
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
    <ProfileHeaderView
      pubkey={props.pubkey}
      followeeCount={followeeCount()}
      followerCount={followerCount()}
      onOpenFollowees={
        stack && (() => stack.push(buildFolloweesColumn(props.pubkey)))
      }
      onOpenFollowers={
        stack && (() => stack.push(buildFollowersColumn(props.pubkey)))
      }
    />
  );
};

export default ProfileHeader;
