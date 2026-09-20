import { columnFacets } from "@streets/core/deck/column-facets";
import { columnShow } from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import { PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import type { Component } from "solid-js";
import { useMutes } from "../settings/MuteMediator";
import ColumnBody from "./ColumnBody";
import EventListColumn from "./EventListColumn";
import {
  type ColumnReadProps,
  alertsFor,
  createColumnSection,
} from "./column-section";

/** 通常の時系列、通知、ブックマーク、明示フィルタのカラム。 */
const FeedColumn: Component<
  ColumnReadProps & { scrollerRef: (element: HTMLDivElement) => void }
> = (props) => {
  const section = createColumnSection(props, PAGE_SIZE);
  const mutes = useMutes();
  const items = () => {
    const source = props.column.source;
    const received =
      source.kind === "notifications"
        ? excludeOwnActions(section.items(), props.viewer)
        : section.items();
    const hidesMuted =
      source.kind === "followees" ||
      source.kind === "notifications" ||
      source.kind === "literal";
    const visible =
      mutes && hidesMuted
        ? received.filter((event) => !mutes.hides(event))
        : received;
    return visibleColumnItems(
      visible,
      columnShow(props.column),
      columnFacets(props.column),
    );
  };
  return (
    <ColumnBody
      columnId={props.column.id}
      alerts={alertsFor(props, section.status)}
      scrollerRef={props.scrollerRef}
    >
      <EventListColumn
        column={props.column}
        items={items()}
        section={section}
        paged
      />
    </ColumnBody>
  );
};

export default FeedColumn;
