import type { CropRect } from "@streets/core/view/compose";
import {
  type Component,
  type JSX,
  Show,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";
import { lazyPart } from "../lazy-part";
import { notifyError } from "../toast";
import Button from "../ui/Button";
import { invalidTextInputClass, textInputClass } from "../ui/TextField";
import { prepareForUpload } from "./prepare";
import { NoUploadServerError, useUploader } from "./uploader";

const CropDialog = lazyPart(() => import("./CropDialog"));

/** 選んだ画像。切り抜く範囲を決めるまで、アップロードしない。 */
type Picked = { file: File; src: string };

/**
 * 画像の URL を書く欄。URL を書くか、画像を選んでアップロードする。上げ終わったら
 * URL の欄に入る。`aspectRatio` を渡すと、上げる前にその形で切り抜かせる。
 */
const ImageUrlField: Component<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 上げている間は true。上げ終わる前に保存すると、画像の無いまま保存される。 */
  onUploading: (uploading: boolean) => void;
  /** いまの URL の小さな見本。 */
  preview: (url: string | undefined) => JSX.Element;
  /** 切り抜く枠の縦横比（幅 ÷ 高さ）。渡さなければ、形を決めずに切り抜かせる。 */
  aspectRatio?: number;
  disabled?: boolean;
  error?: string;
  aside?: JSX.Element;
}> = (props) => {
  const uploader = useUploader();
  const [uploading, setUploading] = createSignal(false);
  const [picked, setPicked] = createSignal<Picked>();
  const inputId = createUniqueId();
  const noteId = `${inputId}-note`;
  let picker: HTMLInputElement | undefined;

  const release = () => {
    const current = picked();
    if (current) URL.revokeObjectURL(current.src);
    setPicked(undefined);
  };
  onCleanup(release);

  const upload = async (file: File, crop: CropRect | undefined) => {
    if (!uploader) return;
    setUploading(true);
    props.onUploading(true);
    try {
      const blob = await uploader.upload(await prepareForUpload(file, crop));
      props.onChange(blob.url);
    } catch (cause) {
      notifyError(cause, "画像をアップロードできませんでした");
    } finally {
      setUploading(false);
      props.onUploading(false);
    }
  };

  const choose = () => {
    // 押せないボタンだけ出すと、なぜ使えないのか分からない。押したら案内する。
    if (!uploader || uploader.servers().length === 0) {
      notifyError(new NoUploadServerError(), "画像をアップロードできません");
      return;
    }
    picker?.click();
  };

  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-center gap-1.5">
        <label for={inputId} class="c-secondary font-600 text-caption">
          {props.label}
        </label>
        {props.aside}
      </div>
      <div class="flex items-center gap-2">
        {props.preview(props.value.trim() || undefined)}
        <input
          id={inputId}
          type="url"
          class={`${props.error ? invalidTextInputClass : textInputClass} min-w-0 flex-1`}
          placeholder="https://"
          value={props.value}
          disabled={props.disabled || uploading()}
          aria-invalid={props.error !== undefined}
          aria-describedby={props.error ? noteId : undefined}
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
        <input
          ref={picker}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setPicked({ file, src: URL.createObjectURL(file) });
          }}
        />
        <Button
          icon="i-material-symbols:upload-rounded"
          disabled={props.disabled || uploading()}
          onClick={choose}
        >
          {uploading() ? "アップロード中…" : "画像を選ぶ"}
        </Button>
      </div>
      <Show when={props.error}>
        <p id={noteId} class="c-danger text-caption">
          {props.error}
        </p>
      </Show>
      <Show when={picked()}>
        {(current) => (
          <CropDialog
            src={current().src}
            name={current().file.name}
            aspectRatio={props.aspectRatio}
            onDone={(crop) => {
              const { file } = current();
              release();
              void upload(file, crop);
            }}
            onClose={release}
          />
        )}
      </Show>
    </div>
  );
};

export default ImageUrlField;
