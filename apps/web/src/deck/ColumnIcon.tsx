import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, Show } from "solid-js";
import { columnView } from "../columns/column-views";
import { useProfile } from "../note/use-profile";
import Avatar from "../ui/Avatar";

/**
 * カラムの印。ユーザーのカラムはその人のアイコンにする —— 人のカラムを
 * いくつも足すと、同じ人形の印が並んで見分けが付かない。
 */
const ColumnIcon: Component<{
  column: ColumnDef;
  /** 記号のアイコンの大きさと色（`size-5.5` など）。 */
  class: string;
  /** 人のアイコンの大きさと角（`size-6 rounded-1.5` など）。 */
  avatarClass: string;
}> = (props) => {
  const person = () =>
    columnView(props.column.source).avatar?.(props.column.source);
  const profile = useProfile(person);
  return (
    <Show
      when={person()}
      fallback={
        <span
          class={`${columnView(props.column.source).meta(props.column.source).icon} ${props.class}`}
          aria-hidden="true"
        />
      }
    >
      {(pubkey) => (
        <Avatar
          pubkey={pubkey()}
          picture={profile()?.picture}
          class={props.avatarClass}
        />
      )}
    </Show>
  );
};

export default ColumnIcon;
