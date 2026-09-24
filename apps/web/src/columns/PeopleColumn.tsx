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
  // フォロワーは kind:3 を 1 人 1 件で数えるので、件数で切ると人数が頭打ちになる。
  const section = createColumnSection(props, {
    maxItems: props.kind === "followers-list" ? Infinity : undefined,
  });
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
