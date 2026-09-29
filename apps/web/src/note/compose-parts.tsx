import type { Attachment } from "@streets/core/view/compose";
import { type Component, For, Show, createSignal, onMount } from "solid-js";
import ComposeEmojiPicker from "../emoji/ComposeEmojiPicker";
import type { PickerEmoji } from "../emoji/emoji-data";
import { lazyPart } from "../lazy-part";
import { useUploader } from "../media/uploader";
import { notifyError } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { textInputClass } from "../ui/TextField";

const CropDialog = lazyPart(() => import("../media/CropDialog"));

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
  <IconButton
    size="md"
    icon={props.icon}
    label={props.onClick ? props.label : `${props.label}（未対応）`}
    title={props.title}
    class={props.muted ? "opacity-50" : undefined}
    disabled={props.onClick === undefined}
    onClick={() => props.onClick?.()}
  />
);

/** 動画は切り抜けない（枠の座標を元の画素に直せないし、切ると音も動きも失う）。 */
const isVideo = (attachment: Attachment) =>
  attachment.type?.startsWith("video/") ?? false;

/** 画像の元の大きさ。切り抜く範囲を割合に直すのに要る。 */
const useNaturalSize = () => {
  const [natural, setNatural] = createSignal<{
    width: number;
    height: number;
  }>();
  return {
    natural,
    onLoad: (event: { currentTarget: HTMLImageElement }) =>
      setNatural({
        width: event.currentTarget.naturalWidth,
        height: event.currentTarget.naturalHeight,
      }),
  };
};

/**
 * 正方形の枠いっぱいに、切り抜く範囲だけを見せる。実際に切らずに、元の画像を
 * 拡げてずらす —— 画素を作るのはアップロードする直前の 1 回だけにしたいため。
 * 枠が正方形なので、縦と横の割合を同じ基準で書ける。
 */
const Thumbnail: Component<{ attachment: Attachment }> = (props) => {
  const { natural, onLoad } = useNaturalSize();
  const framed = () => {
    const crop = props.attachment.crop;
    const size = natural();
    if (!crop || !size) return undefined;
    // 短い辺を枠に合わせると、範囲が枠を覆う。はみ出た分は左右・上下で均す。
    const unit = Math.min(crop.width, crop.height);
    const percent = (value: number) => `${(value / unit) * 100}%`;
    return {
      position: "absolute" as const,
      "max-width": "none",
      width: percent(size.width),
      height: percent(size.height),
      left: percent((unit - crop.width) / 2 - crop.x),
      top: percent((unit - crop.height) / 2 - crop.y),
    };
  };
  return (
    <Show
      when={!isVideo(props.attachment)}
      fallback={
        <>
          {/*
            動画は 1 コマ目を出す。`#t=0.1` を付けないと、多くのブラウザが
            何も描かずに黒いままになる。切り抜けないので、ずらす必要も無い。
          */}
          <video
            src={`${props.attachment.preview}#t=0.1`}
            muted
            playsinline
            preload="metadata"
            class="size-full bg-black object-cover"
          />
          <span class="pointer-events-none absolute inset-0 grid place-items-center">
            <span
              class="i-material-symbols:play-circle-outline c-white size-8 opacity-90"
              aria-label="動画"
            />
          </span>
        </>
      }
    >
      <img
        src={props.attachment.preview}
        alt=""
        class={framed() ? "" : "size-full object-cover"}
        style={framed()}
        onLoad={onLoad}
      />
    </Show>
  );
};

/** プレビューに出す画像の高さの上限。compact の `MediaImage`（`h-30`）に合わせる。 */
const PREVIEW_MAX_HEIGHT = 120;

/**
 * 投稿したときの見え方。切り抜いた形のまま出したいので、枠の縦横比を範囲に
 * 合わせ、高さの上限は幅の上限に言い換える（高さを削ると比が崩れる）。
 */
const PreviewImage: Component<{ attachment: Attachment }> = (props) => {
  const { natural, onLoad } = useNaturalSize();
  const ratio = () => {
    const crop = props.attachment.crop;
    if (crop) return crop.width / crop.height;
    const size = natural();
    return size ? size.width / size.height : undefined;
  };
  const framed = () => {
    const crop = props.attachment.crop;
    const size = natural();
    if (!crop || !size) return undefined;
    return {
      position: "absolute" as const,
      "max-width": "none",
      width: `${(size.width / crop.width) * 100}%`,
      height: `${(size.height / crop.height) * 100}%`,
      left: `${(-crop.x / crop.width) * 100}%`,
      top: `${(-crop.y / crop.height) * 100}%`,
    };
  };
  if (isVideo(props.attachment)) {
    return (
      // oxlint-disable-next-line jsx-a11y/media-has-caption -- 手元の動画を送る前に確かめるだけで、字幕のもとになるものが無い
      <video
        src={`${props.attachment.preview}#t=0.1`}
        controls
        playsinline
        preload="metadata"
        class="w-full rounded-2 bg-black"
        style={{ "max-height": `${PREVIEW_MAX_HEIGHT}px` }}
      />
    );
  }
  return (
    <div
      class="relative w-full overflow-hidden rounded-2 bg-secondary"
      style={{
        "aspect-ratio": ratio() ? `${ratio()}` : undefined,
        "max-width": ratio()
          ? `${PREVIEW_MAX_HEIGHT * (ratio() ?? 1)}px`
          : undefined,
      }}
    >
      <img
        src={props.attachment.preview}
        alt=""
        class={framed() ? "" : "size-full object-cover"}
        style={framed()}
        onLoad={onLoad}
      />
    </div>
  );
};

/** 書きかけのプレビューに出す、まだアップロードしていない画像。 */
export const ComposePreviewMedia: Component<{
  attachments: readonly Attachment[];
}> = (props) => (
  <For each={props.attachments}>
    {(attachment) => <PreviewImage attachment={attachment} />}
  </For>
);

/**
 * 添えたファイル。押すと切り抜ける。並べ替えた順が、本文に並ぶ順になる。
 * 3 つまでは横一列、それより多ければ 3 つずつ折り返す。
 */
export const ComposeAttachments: Component<{
  attachments: readonly Attachment[];
  /** アップロードしている間は触らせない（並べ替えても、もう送る中身は決まっている）。 */
  disabled?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [cropping, setCropping] = createSignal<Attachment>();
  const errors = () => props.attachments.filter((a) => a.error !== undefined);
  const columns = () => Math.min(props.attachments.length, 3);
  return (
    <Show when={props.attachments.length > 0}>
      <ul
        class="grid gap-2 px-4 pt-2"
        style={{
          "grid-template-columns": `repeat(${columns()}, minmax(0, 1fr))`,
        }}
      >
        <For each={props.attachments}>
          {(attachment, index) => (
            <li
              class="relative aspect-square overflow-hidden rounded-2 border"
              classList={{
                "border-primary": attachment.error === undefined,
                "border-danger": attachment.error !== undefined,
              }}
            >
              <button
                type="button"
                class="size-full border-none bg-transparent p-0 enabled:cursor-pointer"
                aria-label={
                  isVideo(attachment)
                    ? attachment.name
                    : `${attachment.name} を切り抜く`
                }
                title={
                  isVideo(attachment)
                    ? "動画は切り抜けません"
                    : `${attachment.name} を切り抜く`
                }
                disabled={props.disabled || isVideo(attachment)}
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

              <Show when={!props.disabled}>
                <IconButton
                  variant="overlay"
                  circle
                  icon="i-material-symbols:close-rounded"
                  label={`${attachment.name} を外す`}
                  class="absolute top-0.5 right-0.5"
                  onClick={() =>
                    dispatch({
                      type: "compose/attach-remove",
                      id: attachment.id,
                    })
                  }
                />

                {/* 並べ替えは前後へ 1 つずつ。掴んで動かすのは、まだ作っていない。 */}
                <Show when={props.attachments.length > 1}>
                  <div class="absolute inset-x-0.5 bottom-0.5 flex justify-between">
                    <IconButton
                      variant="overlay"
                      circle
                      icon="i-material-symbols:chevron-left-rounded"
                      label={`${attachment.name} を前へ`}
                      disabled={index() === 0}
                      onClick={() =>
                        dispatch({
                          type: "compose/attach-move",
                          id: attachment.id,
                          to: index() - 1,
                        })
                      }
                    />
                    <IconButton
                      variant="overlay"
                      circle
                      icon="i-material-symbols:chevron-right-rounded"
                      label={`${attachment.name} を後ろへ`}
                      disabled={index() === props.attachments.length - 1}
                      onClick={() =>
                        dispatch({
                          type: "compose/attach-move",
                          id: attachment.id,
                          to: index() + 1,
                        })
                      }
                    />
                  </div>
                </Show>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={errors().length > 0}>
        <ul class="flex flex-col gap-1 px-4 pt-2">
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
  "画像を添えるには、設定の「画像」でアップロード先を決めてください";

/** アップロード先が無いときの案内。押した・貼った・落としたときにだけ出す。 */
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
 * 画像を選ぶ。アップロード先を決めていないときは押せる状態にし、押したら設定へ案内する
 * （押せないボタンだけ出すと、なぜ使えないのか分からない）。
 */
export const ImageButton: Component = () => {
  const dispatch = useDispatch();
  const guard = useAttachGuard();
  let input: HTMLInputElement | undefined;
  return (
    <>
      {/*
        アップロード先が無いときは押せない見た目にするが、押せなくはしない —— 本当に
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

/** 投稿・返信・引用で同じ足まわり。 */
/** 閲覧注意にする・外す。付けている間は、本文の上に理由の欄が出る。 */
const ContentWarningButton: Component<{
  on: boolean;
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <IconButton
      size="md"
      icon="i-material-symbols:warning-outline-rounded"
      label={props.on ? "閲覧注意を外す" : "閲覧注意にする"}
      active={props.on}
      disabled={props.disabled}
      onClick={() => dispatch({ type: "compose/warning-toggle" })}
    />
  );
};

/** 書きかけを下書きへ移す。添えたファイルは残せないので、添えている間は押せない。 */
const KeepDraftButton: Component<{ disabled: boolean }> = (props) => {
  const dispatch = useDispatch();
  return (
    <IconButton
      size="md"
      icon="i-material-symbols:draft-outline-rounded"
      label="下書きに入れる"
      disabled={props.disabled}
      onClick={() => dispatch({ type: "compose/draft-keep" })}
    />
  );
};

/** 閲覧注意の理由を書く欄。付けている間だけ出す。 */
export const ContentWarningField: Component<{
  reason: string | undefined;
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <Show when={props.reason !== undefined}>
      <ContentWarningInput
        reason={props.reason ?? ""}
        disabled={props.disabled}
        onInput={(reason) =>
          dispatch({ type: "compose/warning-input", reason })
        }
      />
    </Show>
  );
};

const ContentWarningInput: Component<{
  reason: string;
  disabled: boolean;
  onInput: (reason: string) => void;
}> = (props) => {
  let input: HTMLInputElement | undefined;
  // 付けたらそのまま理由を打てるようにする。
  onMount(() => input?.focus());
  return (
    <div class="flex items-center gap-2 px-4 pb-2">
      <span
        class="i-material-symbols:warning-outline-rounded c-secondary size-5 shrink-0"
        aria-hidden="true"
      />
      <input
        ref={input}
        type="text"
        aria-label="閲覧注意の理由"
        placeholder="閲覧注意の理由（任意）"
        class={`${textInputClass} min-w-0 flex-1`}
        disabled={props.disabled}
        value={props.reason}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </div>
  );
};

export const ComposeTools: Component<{
  count: string;
  label: string;
  sending: boolean;
  disabled: boolean;
  /** 閲覧注意の理由。付けていなければ `undefined`。 */
  contentWarning: string | undefined;
  onEmojiSelect: (emoji: PickerEmoji) => void;
  emojiField: () => HTMLTextAreaElement | undefined;
  /** 下書きへ移すボタンを出す。値は押せるか。 */
  canKeepDraft?: boolean;
}> = (props) => (
  <div class="flex h-13 shrink-0 items-center gap-1.5 py-2.5 pr-3 pl-4">
    <ImageButton />
    <ComposeEmojiPicker
      disabled={props.sending}
      onSelect={props.onEmojiSelect}
      field={props.emojiField}
    />
    <ContentWarningButton
      on={props.contentWarning !== undefined}
      disabled={props.sending}
    />
    <Show when={props.canKeepDraft !== undefined}>
      <KeepDraftButton disabled={!props.canKeepDraft} />
    </Show>
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
