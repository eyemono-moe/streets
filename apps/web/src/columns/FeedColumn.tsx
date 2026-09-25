import { columnFacets } from "@streets/core/deck/column-facets";
import { columnShow } from "@streets/core/deck/deck";
import { excludeOwnActions } from "@streets/core/deck/notification-filter";
import type { NostrEvent } from "@streets/core/nostr/event";
import { PAGE_SIZE } from "@streets/core/read/source";
import { visibleColumnItems } from "@streets/core/view/column-items";
import { parseZapReceipt } from "@streets/core/zap/zap-receipt";
import type { Component } from "solid-js";
import { useMutes } from "../settings/MuteMediator";
import { useOwnZapKey } from "../zap/own-zap-key";
import {
  type ColumnReadProps,
  alertsFor,
  createColumnSection,
} from "./column-section";
import ColumnBody from "./ColumnBody";
import EventListColumn from "./EventListColumn";

/** 通常の時系列、通知、ブックマーク、明示フィルタのカラム。 */
const FeedColumn: Component<
  ColumnReadProps & { scrollerRef: (element: HTMLDivElement) => void }
> = (props) => {
  const section = createColumnSection(props, { pageSize: PAGE_SIZE });
  const mutes = useMutes();
  const zapKey = useOwnZapKey(() => props.viewer);
  // 偽の Zap（宛先・金額・受領の署名者が食い違うもの）は通知に並べない。
  const genuine = (event: NostrEvent) =>
    event.kind !== 9735 ||
    parseZapReceipt(event, {
      recipient: props.viewer,
      nostrPubkey: zapKey(),
    }) !== undefined;
  const items = () => {
    const source = props.column.source;
    const received =
      source.kind === "notifications"
        ? excludeOwnActions(section.items(), props.viewer).filter(genuine)
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
