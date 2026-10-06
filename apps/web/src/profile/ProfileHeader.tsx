import {
  buildFolloweesColumn,
  buildFollowersColumn,
} from "@streets/core/deck/column-presets";
import { followeesFrom, followsPubkey } from "@streets/core/nostr/follow-list";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, createEffect, createMemo } from "solid-js";
import { useEventActions } from "../actions";
import { useDispatch } from "../ui-events";
import ProfileHeaderView from "./ProfileHeaderView";

/**
 * ユーザーのカラムの先頭。フォロー数・フォロワーを押すと、その一覧を
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
  // フォロワーは見出しでは数えない。数えるにはフォロワー全員の kind:3（1 件で
  // 数千のタグを持つ）を取るしかなく、人気のある人では数十 MB になる。人数は
  // 押して開くフォロワーの一覧で出す。

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
