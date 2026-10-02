import {
  columnAlerts,
  columnNeedsAccount,
  columnStatus,
} from "@streets/core/deck/column-kinds";
import { type ColumnDef, columnLinkCards } from "@streets/core/deck/deck";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { SectionStatus } from "@streets/core/read/source";
import {
  type Accessor,
  type Component,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { LinkCardModeProvider } from "../note/link-card";
import { readRoutingMode } from "../read-routing-setting";
import { ColumnScope } from "./column-scope";
import { type ColumnInputs, columnView } from "./column-views";
import ColumnBody from "./ColumnBody";
import NeedsAccount from "./NeedsAccount";

export type ColumnContentProps = ColumnInputs & {
  column: ColumnDef;
  readLayer: ReadLayer;
  scrollerRef: (element: HTMLDivElement) => void;
};

/** カラムの中身の枠。種類ごとの中身は `column-views` の表から選ぶ。 */
const ColumnContent: Component<ColumnContentProps> = (props) => {
  const [statuses, setStatuses] = createSignal<Accessor<SectionStatus>[]>([]);
  const report = (status: Accessor<SectionStatus>) => {
    setStatuses((current) => [...current, status]);
    onCleanup(() =>
      setStatuses((current) => current.filter((item) => item !== status)),
    );
  };
  const view = () => columnView(props.column.source);
  const alerts = () =>
    columnAlerts(
      props.column,
      columnStatus(statuses().map((status) => status())),
      props.relayList(),
      readRoutingMode(),
    );

  return (
    <ColumnScope
      value={{
        column: () => props.column,
        readLayer: props.readLayer,
        report,
      }}
    >
      <LinkCardModeProvider value={() => columnLinkCards(props.column)}>
        <ColumnBody
          columnId={props.column.id}
          alerts={alerts()}
          scrollsInternally={view().scrollsInternally}
          scrollerRef={props.scrollerRef}
        >
          <Show
            when={props.signedIn || !columnNeedsAccount(props.column)}
            fallback={<NeedsAccount column={props.column} />}
          >
            <Dynamic
              component={view().Content}
              source={props.column.source}
              inputs={props}
            />
          </Show>
        </ColumnBody>
      </LinkCardModeProvider>
    </ColumnScope>
  );
};

export default ColumnContent;
