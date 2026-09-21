import type { Attachment } from "@streets/core/view/compose";
import { type Component, For, Show, createSignal } from "solid-js";
import { useUploader } from "../media/uploader";
import { notifyError } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import CropDialog from "./CropDialog";

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** 見た目の文字数。サロゲートペアや結合絵文字を 1 文字として数える。 */
export const countCharacters = (text: string) =>
  [...graphemes.segment(text)].length;

const ToolButton: Component<{
  label: string;
  icon: string;
  title?: string;
  /** 押せるが、今は使えない見た目にする。 */
  muted?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    type="button"
    aria-label={props.onClick ? props.label : `${props.label}（未対応）`}
    title={props.title}
    class="c-secondary grid size-8 place-items-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-secondary disabled:opacity-50"
    classList={{ "opacity-50": props.muted }}
    disabled={props.onClick === undefined}
    onClick={() => props.onClick?.()}
  >
    <span class={`${props.icon} size-5`} aria-hidden="true" />
  </button>
);

/** 一覧に出す見本の一辺（`size-20`）。 */
const THUMBNAIL = 80;

/**
 * 添えた画像の見本。切り抜く範囲が決まっていれば、その範囲だけが見えるように
 * 元の画像をずらして出す —— 画素を作るのは預ける直前の 1 回だけにしたいので、
 * ここでは切らない。
 */
const Thumbnail: Component<{ attachment: Attachment }> = (props) => {
  const [natural, setNatural] = createSignal<{
    width: number;
    height: number;
  }>();
  const framed = () => {
    const crop = props.attachment.crop;
    const size = natural();
    if (!crop || !size) return undefined;
    // 切り抜く範囲が見本いっぱいになる倍率。はみ出た分は左右・上下で均す。
    const scale = Math.max(THUMBNAIL / crop.width, THUMBNAIL / crop.height);
    return {
      position: "absolute" as const,
      "max-width": "none",
      width: `${size.width * scale}px`,
      height: `${size.height * scale}px`,
      left: `${(THUMBNAIL - crop.width * scale) / 2 - crop.x * scale}px`,
      top: `${(THUMBNAIL - crop.height * scale) / 2 - crop.y * scale}px`,
    };
  };
  return (
    <img
      src={props.attachment.preview}
      alt=""
      class={framed() ? "" : "size-full object-cover"}
      style={framed()}
      onLoad={(event) =>
        setNatural({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
};

/** 添えたファイル。押すと切り抜ける。並べ替えた順が、本文に並ぶ順になる。 */
export const ComposeAttachments: Component<{
  attachments: readonly Attachment[];
}> = (props) => {
  const dispatch = useDispatch();
  const [cropping, setCropping] = createSignal<Attachment>();
  const errors = () => props.attachments.filter((a) => a.error !== undefined);
  return (
    <Show when={props.attachments.length > 0}>
      <ul class="flex flex-wrap gap-2 px-4 pt-2">
        <For each={props.attachments}>
          {(attachment, index) => (
            <li
              class="relative size-20 overflow-hidden rounded-2 border"
              classList={{
                "border-primary": attachment.error === undefined,
                "border-danger": attachment.error !== undefined,
              }}
            >
              <button
                type="button"
                class="size-full cursor-pointer border-none bg-transparent p-0"
                aria-label={`${attachment.name} を切り抜く`}
                title={`${attachment.name} を切り抜く`}
                onClick={() => setCropping(attachment)}
              >
                <Thumbnail attachment={attachment} />
              </button>

              <Show when={attachment.uploading}>
                <span class="absolute inset-0 grid place-items-center bg-black/50">
                  <span
                    class="i-material-symbols:progress-activity c-white size-6 animate-spin"
                    aria-label="アップロード中"
                  />
                </span>
              </Show>

              <button
                type="button"
                aria-label={`${attachment.name} を外す`}
                class="c-white absolute top-0.5 right-0.5 grid size-6 cursor-pointer place-items-center rounded-full border-none bg-black/60"
                onClick={() =>
                  dispatch({
                    type: "compose/attach-remove",
                    id: attachment.id,
                  })
                }
              >
                <span
                  class="i-material-symbols:close-rounded size-4"
                  aria-hidden="true"
                />
              </button>

              {/* 並べ替えは前後へ 1 つずつ。掴んで動かすのは、まだ作っていない。 */}
              <Show when={props.attachments.length > 1}>
                <div class="absolute inset-x-0 bottom-0 flex justify-between bg-black/50">
                  <button
                    type="button"
                    aria-label={`${attachment.name} を前へ`}
                    disabled={index() === 0}
                    class="c-white grid size-6 place-items-center border-none bg-transparent enabled:cursor-pointer disabled:opacity-30"
                    onClick={() =>
                      dispatch({
                        type: "compose/attach-move",
                        id: attachment.id,
                        to: index() - 1,
                      })
                    }
                  >
                    <span
                      class="i-material-symbols:chevron-left-rounded size-4"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`${attachment.name} を後ろへ`}
                    disabled={index() === props.attachments.length - 1}
                    class="c-white grid size-6 place-items-center border-none bg-transparent enabled:cursor-pointer disabled:opacity-30"
                    onClick={() =>
                      dispatch({
                        type: "compose/attach-move",
                        id: attachment.id,
                        to: index() + 1,
                      })
                    }
                  >
                    <span
                      class="i-material-symbols:chevron-right-rounded size-4"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={errors().length > 0}>
        <ul class="flex flex-col gap-1 px-4 pb-1">
          <For each={errors()}>
            {(attachment) => (
              <li class="c-danger flex items-center gap-1.5 text-caption">
                <span
                  class="i-material-symbols:error-outline-rounded size-4 shrink-0"
                  aria-hidden="true"
                />
                <span class="min-w-0 max-w-40 truncate">{attachment.name}</span>
                <span class="min-w-0 flex-1 truncate">{attachment.error}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={cropping()}>
        {(attachment) => (
          <CropDialog
            src={attachment().preview}
            name={attachment().name}
            crop={attachment().crop}
            onDone={(crop) => {
              dispatch({
                type: "compose/attach-crop",
                id: attachment().id,
                crop,
              });
              setCropping(undefined);
            }}
            onClose={() => setCropping(undefined)}
          />
        )}
      </Show>
    </Show>
  );
};

const NO_SERVER_MESSAGE =
  "画像を添えるには、設定の「画像」で預け先を決めてください";

/** 預け先が無いときの案内。押した・貼った・落としたときにだけ出す。 */
export const useAttachGuard = () => {
  const uploader = useUploader();
  return {
    /** 添えられるか。添えられないときは案内を出して false を返す。 */
    allow: () => {
      if (uploader && uploader.servers().length > 0) return true;
      notifyError(new Error(NO_SERVER_MESSAGE), "画像を添えられません");
      return false;
    },
    ready: () => (uploader?.servers().length ?? 0) > 0,
    message: NO_SERVER_MESSAGE,
  };
};

/** 貼り付け・ドラッグして落とす、でファイルを添える。textarea に付ける。 */
export const useDropAndPaste = () => {
  const dispatch = useDispatch();
  const guard = useAttachGuard();
  const attach = (files: readonly File[]) => {
    if (files.length === 0) return false;
    if (!guard.allow()) return true;
    dispatch({ type: "compose/attach", files });
    return true;
  };
  return {
    onPaste: (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (attach(files)) event.preventDefault();
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
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
  const guard = useAttachGuard();
  let input: HTMLInputElement | undefined;
  return (
    <>
      {/*
        預け先が無いときは押せない見た目にするが、押せなくはしない —— 本当に
        disabled にすると、なぜ使えないのかを知らせる機会が無くなる。
      */}
      <ToolButton
        label="画像を添える"
        icon="i-material-symbols:image-outline-rounded"
        muted={!guard.ready()}
        title={guard.ready() ? "画像を添える" : guard.message}
        onClick={() => {
          if (!guard.allow()) return;
          input?.click();
        }}
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
    </>
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
