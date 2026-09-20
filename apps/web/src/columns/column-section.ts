import { columnAlerts } from "@streets/core/deck/column-alerts";
import type { ColumnDef } from "@streets/core/deck/deck";
import { resolveSource } from "@streets/core/deck/resolve-source";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import { createSection } from "@streets/core/solid/create-section";
import { createEffect } from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";

export type ColumnReadProps = {
  column: ColumnDef;
  readLayer: ReadLayer;
  viewer: string;
  followees: () => readonly string[];
  relayList: () => RelayListState;
  bookmarks: () => readonly string[];
};

/** カラムの意図を購読へ変換し、購読の診断値も登録する。 */
export const createColumnSection = (
  props: ColumnReadProps,
  pageSize?: number,
) => {
  const section = createSection({
    manager: props.readLayer.manager,
    pageSize,
    source: () =>
      resolveSource(props.column.source, {
        followees: props.followees,
        viewer: props.viewer,
        relayList: props.relayList,
        bookmarks: props.bookmarks,
      }),
  });
  createEffect(() =>
    setDiagnostics("sections", props.column.id, {
      ...section.status(),
      items: section.items().length,
    }),
  );
  return section;
};

export const alertsFor = (
  props: ColumnReadProps,
  status: ReturnType<typeof createColumnSection>["status"],
) => columnAlerts(props.column, status(), props.relayList());
