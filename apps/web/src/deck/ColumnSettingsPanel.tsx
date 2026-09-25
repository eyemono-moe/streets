import { columnFacets } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import type { RelayListState } from "@streets/core/settings/relay-list-state";
import type { Component } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import ColumnSettings from "./ColumnSettings";
import ColumnTitle from "./ColumnTitle";

/** 本文を押し下げず、通常のカラムと横に並ぶ設定専用カラム。 */
const ColumnSettingsPanel: Component<{
  column: ColumnDef;
  relayList: RelayListState;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <aside class="flex h-full min-h-0 flex-col">
      <header class="flex h-11.25 shrink-0 items-center gap-2.5 border-primary border-b-1 bg-primary px-3">
        <span
          class="i-material-symbols:tune-rounded c-secondary size-4.5 shrink-0"
          aria-hidden="true"
        />
        <h2 class="c-primary min-w-0 flex-1 truncate font-600 text-body">
          <ColumnTitle column={props.column} />
          の設定
        </h2>
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:close-rounded"
          aria-label="カラムの設定を閉じる"
          onClick={() =>
            dispatch({ type: "deck/toggle-settings", id: props.column.id })
          }
        />
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <ColumnSettings
          column={props.column}
          facets={columnFacets(props.column)}
          relayList={props.relayList}
        />
      </div>
    </aside>
  );
};

export default ColumnSettingsPanel;
