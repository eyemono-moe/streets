import { columnFacets } from "@streets/core/deck/column-facets";
import { columnShow } from "@streets/core/deck/deck";
import { PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import type { Component } from "solid-js";
import ProfileHeader from "../profile/ProfileHeader";
import ColumnBody from "./ColumnBody";
import EventListColumn from "./EventListColumn";
import {
  type ColumnReadProps,
  alertsFor,
  createColumnSection,
} from "./column-section";

const UserColumn: Component<
  ColumnReadProps & {
    pubkey: string;
    scrollerRef: (element: HTMLDivElement) => void;
  }
> = (props) => {
  const section = createColumnSection(props, { pageSize: PAGE_SIZE });
  const items = () =>
    visibleColumnItems(
      section.items(),
      columnShow(props.column),
      columnFacets(props.column),
    );
  return (
    <ColumnBody
      columnId={props.column.id}
      alerts={alertsFor(props, section.status)}
      scrollerRef={props.scrollerRef}
    >
      <ProfileHeader pubkey={props.pubkey} readLayer={props.readLayer} />
      <EventListColumn
        column={props.column}
        items={items()}
        section={section}
        paged
      />
    </ColumnBody>
  );
};

export default UserColumn;
