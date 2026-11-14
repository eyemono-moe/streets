import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import UiSwitch from "../ui/Switch";
import ColumnSheet from "./ColumnSheet";

export type UploadPrompt = {
  filename?: string;
  mimeType: string;
  size: number;
  /** 画像なら、見せるための一時的な URL（blob:）。 */
  previewUrl?: string;
  /** 上げ先のホスト名。 */
  server: string;
  caption?: string;
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * アップレットから、ファイルのアップロードを頼まれたときに確かめるシート。上げたものは
 * 公開され消しにくいので、中身（画像なら見た目）と上げ先を見せる。
 */
const UploadSheet: Component<
  UploadPrompt & {
    source: string;
    onApprove: (remember: boolean) => void;
    onCancel: () => void;
  }
> = (props) => {
  const [remember, setRemember] = createSignal(false);
  return (
    <ColumnSheet
      label={`${props.source} からのアップロード`}
      source={props.source}
      title={<>{props.server} へファイルをアップロードしようとしています</>}
      onCancel={() => props.onCancel()}
    >
      <Show when={props.previewUrl}>
        {(url) => (
          <img
            src={url()}
            alt={props.caption ?? ""}
            class="max-h-48 self-start rounded-2 border border-primary object-contain"
          />
        )}
      </Show>
      <p class="c-primary break-anywhere text-body">
        {props.filename ?? "名前の無いファイル"}
      </p>
      <p class="c-secondary text-caption">
        {props.mimeType}・{formatSize(props.size)}
      </p>
      <p class="c-status-warn flex items-start gap-1 text-caption">
        <span
          class="i-material-symbols:public size-3.5 mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <span>
          上げたファイルは公開され、URL を知っている人は誰でも見られます。
        </span>
      </p>
      <UiSwitch
        label="このアップレットのアップロードは、今後は確認しない"
        checked={remember()}
        onChange={setRemember}
      />
      <div class="flex justify-end gap-2">
        <Button onClick={() => props.onCancel()}>やめる</Button>
        <Button variant="primary" onClick={() => props.onApprove(remember())}>
          アップロードする
        </Button>
      </div>
    </ColumnSheet>
  );
};

export default UploadSheet;
