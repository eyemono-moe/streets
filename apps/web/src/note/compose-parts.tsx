import type { Upload } from "@streets/core/view/compose";
import { type Component, For, Show } from "solid-js";
import { useUploader } from "../media/uploader";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** 見た目の文字数。サロゲートペアや結合絵文字を 1 文字として数える。 */
export const countCharacters = (text: string) =>
  [...graphemes.segment(text)].length;

const ToolButton: Component<{
  label: string;
  icon: string;
  onClick?: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.onClick ? props.label : `${props.label}（未対応）`}
    class="c-secondary grid size-8 place-items-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-secondary disabled:opacity-50"
    disabled={props.onClick === undefined}
    onClick={() => props.onClick?.()}
  >
    <span class={`${props.icon} size-5`} aria-hidden="true" />
  </button>
);

/**
 * 預けている途中・預けられなかったファイル。預け終わったものは本文の URL になるので
 * ここには出ない。
 */
export const ComposeUploads: Component<{ uploads: readonly Upload[] }> = (
  props,
) => {
  const dispatch = useDispatch();
  return (
    <Show when={props.uploads.length > 0}>
      <ul class="flex flex-col gap-1 px-4 pb-1">
        <For each={props.uploads}>
          {(upload) => (
            <li class="flex items-center gap-2 text-caption">
              <span
                class="size-4 shrink-0"
                classList={{
                  "i-material-symbols:progress-activity animate-spin c-secondary":
                    upload.error === undefined,
                  "i-material-symbols:error-outline-rounded c-danger":
                    upload.error !== undefined,
                }}
                aria-hidden="true"
              />
              <span class="c-primary min-w-0 truncate">{upload.name}</span>
              <span
                class="min-w-0 flex-1 truncate"
                classList={{
                  "c-secondary": upload.error === undefined,
                  "c-danger": upload.error !== undefined,
                }}
              >
                {upload.error ?? "アップロード中…"}
              </span>
              <Show when={upload.error}>
                <button
                  type="button"
                  aria-label={`${upload.name} の失敗を消す`}
                  class="c-secondary grid size-6 shrink-0 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
                  onClick={() =>
                    dispatch({ type: "compose/attach-dismiss", id: upload.id })
                  }
                >
                  <span
                    class="i-material-symbols:close-rounded size-4"
                    aria-hidden="true"
                  />
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
};

/**
 * 貼り付け・ドラッグして落とす、でファイルを添える。textarea に付ける。
 */
export const useDropAndPaste = () => {
  const dispatch = useDispatch();
  const uploader = useUploader();
  const attach = (files: readonly File[]) => {
    if (!uploader || files.length === 0) return false;
    dispatch({ type: "compose/attach", files });
    return true;
  };
  return {
    onPaste: (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (attach(files)) event.preventDefault();
    },
    onDragOver: (event: DragEvent) => {
      if (uploader && event.dataTransfer?.types.includes("Files")) {
        event.preventDefault();
      }
    },
    onDrop: (event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (attach(files)) event.preventDefault();
    },
  };
};

/**
 * 画像を選ぶ。預け先を決めていないときは押せる状態にし、押したら設定へ案内する
 * （押せないボタンだけ出すと、なぜ使えないのか分からない）。
 */
const ImageButton: Component = () => {
  const dispatch = useDispatch();
  const uploader = useUploader();
  let input: HTMLInputElement | undefined;
  return (
    <Show
      when={uploader}
      fallback={
        <ToolButton
          label="画像"
          icon="i-material-symbols:image-outline-rounded"
        />
      }
    >
      <ToolButton
        label="画像を添える"
        icon="i-material-symbols:image-outline-rounded"
        onClick={() => input?.click()}
      />
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length > 0) dispatch({ type: "compose/attach", files });
        }}
      />
    </Show>
  );
};

/** 投稿と返信で同じ足まわり。追加・公開範囲はまだ作っていない。 */
export const ComposeTools: Component<{
  count: string;
  label: string;
  sending: boolean;
  disabled: boolean;
}> = (props) => (
  <div class="flex h-13 items-center gap-1.5 py-2.5 pr-3 pl-4">
    <ImageButton />
    <ToolButton label="追加" icon="i-material-symbols:add-rounded" />
    <ToolButton label="公開範囲" icon="i-material-symbols:globe" />
    <span class="flex-1" />
    <span class="c-secondary text-caption">{props.count}</span>
    <Button
      type="submit"
      variant="primary"
      disabled={props.sending || props.disabled}
    >
      <Show when={!props.sending} fallback="送信中…">
        {props.label}
      </Show>
    </Button>
  </div>
);
