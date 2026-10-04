import {
  buildFolloweesColumn,
  buildFollowersColumn,
} from "@streets/core/deck/column-presets";
import { followeesFrom, followsPubkey } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createAuthorCount } from "@streets/core/solid/create-author-count";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, createEffect, createMemo } from "solid-js";
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
  // その人を見に来たので、手元のプロフィールが新しくても取り直す。
  createEffect(() => props.readLayer.lookups.refreshProfile(props.pubkey));
  const followees = createSection({
    manager: props.readLayer.manager,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], authors: [props.pubkey], limit: 1 }],
    }),
  });
  // フォロワーの kind:3 は 1 件で数千のタグを持つ。数えるだけなので、本体は持たない。
  const followerCount = createAuthorCount({
    manager: props.readLayer.manager,
    source: () => ({
      type: "nostr",
      filters: [{ kinds: [3], "#p": [props.pubkey] }],
    }),
  });

  const followeeCount = createMemo(
    () => followeesFrom(followees.items()[0]).length,
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
