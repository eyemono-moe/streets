import { followeesFrom } from "@streets/core/nostr/follow-list";
import type { NostrSource } from "@streets/core/read/source";
import type { Component } from "solid-js";
import ProfileList from "../../profile/ProfileList";
import { createBlockSection } from "../column-scope";

/** 1 件のフォローリスト（kind:3）から、フォローしている人を並べる。 */
const FollowList: Component<{ source: () => NostrSource | undefined }> = (
  props,
) => {
  const section = createBlockSection({ source: () => props.source() });
  return (
    <ProfileList
      people={followeesFrom(section.items()[0])}
      settled={section.status().phase === "settled"}
      empty="まだ誰もフォローしていません。"
    />
  );
};

export default FollowList;
