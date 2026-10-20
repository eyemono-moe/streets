import type { ColumnDef } from "@streets/core/deck/deck";
import type { Component } from "solid-js";
import { useColumnTitle } from "../deck/ColumnTitle";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

/** 自分に紐づくカラムを、ログインしていない人が開いたとき。 */
const NeedsAccount: Component<{ column: ColumnDef }> = (props) => {
  const dispatch = useDispatch();
  const title = useColumnTitle(() => props.column);
  return (
    <div class="flex flex-col items-start gap-3 p-4">
      <p class="c-secondary text-caption">
        {t("columns.needsAccount.description", { title: title() })}
      </p>
      <Button
        size="sm"
        icon="i-material-symbols:login-rounded"
        onClick={() => dispatch({ type: "deck/login" })}
      >
        {t("columns.needsAccount.login")}
      </Button>
    </div>
  );
};

export default NeedsAccount;
