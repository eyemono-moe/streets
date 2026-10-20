import { type JSX, type ParentComponent } from "solid-js";
import Button from "../ui/Button";
import ColumnSheet from "./ColumnSheet";

/**
 * アップレットに頼まれた操作（フォロー・リアクション・通報など）を、行う前に確かめる
 * シート。何をするかは `title` と中身で見せる。
 */
const ActionSheet: ParentComponent<{
  /** 頼んだアップレットの名前。 */
  source: string;
  title: JSX.Element;
  confirmLabel: string;
  /** 取り消しにくい・人に影響する操作（通報など）。 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = (props) => (
  <ColumnSheet
    label={`${props.source} からの依頼`}
    source={props.source}
    title={props.title}
    onCancel={() => props.onCancel()}
  >
    {props.children}
    <div class="flex justify-end gap-2">
      <Button onClick={() => props.onCancel()}>やめる</Button>
      <Button
        variant={props.danger ? "danger" : "primary"}
        onClick={() => props.onConfirm()}
      >
        {props.confirmLabel}
      </Button>
    </div>
  </ColumnSheet>
);

export default ActionSheet;
