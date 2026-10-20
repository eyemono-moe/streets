import { type Component, Show } from "solid-js";
import Button from "../ui/Button";
import ColumnSheet from "./ColumnSheet";

export type LinkSheetProps = {
  /** 頼んだアップレットの名前。 */
  source: string;
  url: string;
  /** punycode に直したホスト名。見た目の似た文字のドメインを見分けられるように出す。 */
  hostname: string;
  /** アップレットが添えた説明。行き先の証拠にはならない。 */
  label?: string;
  onOpen: () => void;
  onCancel: () => void;
};

/**
 * アップレットが、押されていないのに外のページを開こうとしたときに確かめるシート。
 * 押されて開くとき（ふつうのリンク）は出さない。
 */
const LinkSheet: Component<LinkSheetProps> = (props) => (
  <ColumnSheet
    label={`${props.source} からのリンク`}
    source={props.source}
    title={
      <>
        <span class="break-all">{props.hostname}</span>{" "}
        を新しいタブで開こうとしています
      </>
    }
    onCancel={() => props.onCancel()}
  >
    <Show when={props.label}>
      {(label) => (
        <p class="c-secondary break-anywhere text-caption">
          アップレットの説明：{label()}
        </p>
      )}
    </Show>
    <p class="c-primary max-h-24 overflow-y-auto break-all rounded-2 border border-primary bg-secondary px-3 py-2 text-caption">
      {props.url}
    </p>
    <div class="flex justify-end gap-2">
      <Button onClick={() => props.onCancel()}>やめる</Button>
      <Button
        variant="primary"
        icon="i-material-symbols:open-in-new-rounded"
        onClick={() => props.onOpen()}
      >
        開く
      </Button>
    </div>
  </ColumnSheet>
);

export default LinkSheet;
