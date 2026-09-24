import { followeesFrom, followersFrom } from "@streets/core/nostr/follow-list";
import type { Component } from "solid-js";
import ProfileList from "../profile/ProfileList";
import {
  type ColumnReadProps,
  alertsFor,
  createColumnSection,
} from "./column-section";
import ColumnBody from "./ColumnBody";

const PeopleColumn: Component<
  ColumnReadProps & {
    kind: "followees-list" | "followers-list";
    scrollerRef: (element: HTMLDivElement) => void;
  }
> = (props) => {
  const section = createColumnSection(props);
  const people = () =>
    props.kind === "followees-list"
      ? followeesFrom(section.items()[0])
      : followersFrom(section.items());
  return (
    <ColumnBody
      columnId={props.column.id}
      alerts={alertsFor(props, section.status)}
      scrollerRef={props.scrollerRef}
    >
      <ProfileList
        people={people()}
        settled={section.status().phase === "settled"}
        empty={
          props.kind === "followers-list"
            ? "フォロワーを取得できませんでした。"
            : "まだ誰もフォローしていません。"
        }
      />
    </ColumnBody>
  );
};

export default PeopleColumn;
