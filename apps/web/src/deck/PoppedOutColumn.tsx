import type { ColumnDef } from "@streets/core/deck/deck";
import { type Component, Show } from "solid-js";
import { ColumnHeader } from "../columns/ColumnHeader";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import ColumnAccentBar from "./ColumnAccentBar";

/**
 * ピクチャーインピクチャーに出したカラムの、デッキでの置き場。同じカラムを 2 か所に描くと、
 * 購読も DOM も倍になるので、ここには中身を描かない。見出しは残し、掴んで並べ替えられる。
 */
const PoppedOutColumn: Component<{
  column: ColumnDef;
  grip?: boolean;
  /** 狭い画面では上のバーが見出しを兼ねるので、ここには出さない。 */
  header?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary">
      <Show when={props.header !== false}>
        <ColumnAccentBar />
        <ColumnHeader
          column={props.column}
          open={false}
          grip={props.grip}
          poppedOut
          onTitle={() => {}}
        />
      </Show>
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span
          class="i-material-symbols:picture-in-picture-alt-outline-rounded c-secondary size-8"
          aria-hidden="true"
        />
        <p class="c-secondary text-caption">
          ピクチャーインピクチャーで表示しています
        </p>
        <Button
          size="sm"
          icon="i-material-symbols:pip-exit-outline-rounded"
          onClick={() => dispatch({ type: "deck/pop-in" })}
        >
          デッキに戻す
        </Button>
      </div>
    </section>
  );
};

export default PoppedOutColumn;
