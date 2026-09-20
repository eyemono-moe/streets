import type { NostrEvent } from "@streets/core/nostr/event";
import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { SectionStatus } from "@streets/core/read/source";
import type { Component } from "solid-js";
import ProfileList from "../profile/ProfileList";

const PeopleColumn: Component<{
  kind: "followees-list" | "followers-list";
  events: readonly NostrEvent[];
  status: SectionStatus;
}> = (props) => {
  const people = () =>
    props.kind === "followees-list"
      ? followeesFrom(props.events[0])
      : followersFrom(props.events);
  return (
    <ProfileList
      people={people()}
      settled={props.status.phase === "settled"}
      empty={
        props.kind === "followers-list"
          ? "フォロワーを取得できませんでした。"
          : "まだ誰もフォローしていません。"
      }
    />
  );
};

export default PeopleColumn;
