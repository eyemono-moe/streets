import type { ColumnDef } from "@streets/core/deck/deck";
import type { Component } from "solid-js";
import { useColumnTitle } from "../deck/ColumnTitle";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

/** 自分に紐づくカラムを、ログインしていない人が開いたとき。 */
const NeedsAccount: Component<{ column: ColumnDef }> = (props) => {
  const dispatch = useDispatch();
  const title = useColumnTitle(() => props.column);
  return (
    <div class="flex flex-col items-start gap-3 p-4">
      <p class="c-secondary text-caption">
        「{title()}
        」は、ログインしている人の投稿を表示するカラムです。ログインすると見られます。
      </p>
      <Button
        size="sm"
        icon="i-material-symbols:login-rounded"
        onClick={() => dispatch({ type: "deck/login" })}
      >
        ログインする
      </Button>
    </div>
  );
};

export default NeedsAccount;
