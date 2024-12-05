import { FileUpload, useFileUpload } from "@ark-ui/solid/file-upload";
import { Popover } from "@kobalte/core/popover";
import { Progress } from "@kobalte/core/progress";
import { autofocus } from "@solid-primitives/autofocus";
import stringify from "safe-stable-stringify";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import { useFileServer } from "../../../context/fileServer";
import { useMe } from "../../../context/me";
import { useI18n } from "../../../i18n";
import EmojiPicker from "../../../shared/components/EmojiPicker";
import Button from "../../../shared/components/UI/Button";
import { createDebounced } from "../../../shared/libs/createDebounced";
import { getTextOrFile } from "../../../shared/libs/dataTransfer";
import {
  parseTextContent,
  parsedContents2Tags,
} from "../../../shared/libs/parseTextContent";
import { parseTextNoteTags } from "../../../shared/libs/parser/1_shortTextNote";
import type { EmojiTag } from "../../../shared/libs/parser/commonTag";
import { useEmojis, useSendShortText } from "../../../shared/libs/query";
import { maxSizeMB, needResize, resize } from "../../../shared/libs/resize";
import { toast } from "../../../shared/libs/toast";
import {
  extractFileUrl,
  fileUploadResToImetaTag,
  useUploadFiles,
} from "../../../shared/libs/uploadFile";
import NeedLoginPlaceholder from "../../Column/components/NeedLoginPlaceholder";
import { usePostInput } from "../context/postInputDialog";
import { useFileDrop } from "../lib/useFileDrop";
import PostPreview from "./PostPreview";

// prevents from being tree-shaken by TS
autofocus;

const PostInput: Component<{
  defaultContent?: string;
  tags?: string[][];
}> = (props) => {
  // TODO: reply target, image upload, pubkey/emoji auto complete
  // TODO: component, hookの分割

  const t = useI18n();

  const [content, setContent] = createSignal(props.defaultContent ?? "");
  const debouncedContent = createDebounced(content, 1000, "");
  const [textarea, setTextarea] = createSignal<HTMLTextAreaElement>();

  const [{ myPubkey, isLogged }] = useMe();
  const myEmoji = useEmojis(myPubkey);
  const flatEmojis = createMemo<EmojiTag[]>(() => {
    return myEmoji.emojiSets().flatMap(
      (emojiSet) =>
        emojiSet().data?.parsed.emojis.map((emoji) => ({
          kind: "emoji",
          name: emoji.name,
          url: emoji.url,
        })) ?? [],
    );
  });

  /**
   * テキストをパースして得られたタグのリスト
   */
  const referenceTags = createMemo(() => {
    const parsedContents = parseTextContent(content(), flatEmojis(), true);
    const tags = parsedContents2Tags(parsedContents);
    if (props.tags) {
      tags.push(...props.tags);
    }

    // タグの重複を削除
    const distinctTags = Array.from(
      new Map(tags.map((tag) => [stringify(tag), tag])).values(),
    );

    return distinctTags;
  });
  const tagsForPreview = createMemo(() => parseTextNoteTags(referenceTags()));

  /**
   * カーソル位置にテキストを挿入する関数
   */
  const insertText = (insert: string) => {
    const _textarea = textarea();
    if (!_textarea) return;
    const start = _textarea.selectionStart;
    const end = _textarea.selectionEnd;
    const text = content();
    const newText = text.slice(0, start) + insert + text.slice(end);
    setContent(newText);
    _textarea.focus();
    _textarea.setSelectionRange(start + insert.length, start + insert.length);
  };

  const textareaStyle =
    "w-full resize-none min-h-30 block overflow-hidden break-anywhere whitespace-pre-wrap";

  const handleCtrlEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      postText();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData) {
      const res = getTextOrFile(e.clipboardData);
      if (res) {
        if (typeof res === "string") {
          return;
        }
        addAttachment(res);
      }
    }
  };

  const [isSending, setIsSending] = createSignal(false);
  const { progress: fileUploadProgress, uploadFiles } = useUploadFiles();
  const { sendShortText } = useSendShortText();

  const [, serverConfig] = useFileServer();
  const fileUpload = useFileUpload({
    disabled: serverConfig.state !== "ready",
    maxFiles: Number.POSITIVE_INFINITY,
    capture: "environment",
    directory: false,
    accept:
      serverConfig.state === "ready"
        ? serverConfig()?.content_types
        : undefined,
    onFileReject(details) {
      if (details.files.length === 0) return;
      toast.error(
        t("postInput.fileUpload.unsupported", {
          filenames: details.files
            .filter((fileRejection) =>
              fileRejection.errors.includes("FILE_INVALID_TYPE"),
            )
            .map((fileRejection) => fileRejection.file.name)
            .join(", "),
        }),
      );
    },
  });

  const { isDragging, onDrop, canDrop, onDragOver, onDragLeave, onDragStart } =
    useFileDrop((textOrFiles) => {
      if (isSending()) return;
      if (typeof textOrFiles === "string") {
        insertText(textOrFiles);
      } else {
        addAttachment(textOrFiles);
      }
    });

  const addAttachment = (files: File[]) => {
    if (serverConfig.state !== "ready") {
      toast.error(t("noFileServerConfigured"));
      return;
    }
    fileUpload().setFiles(files);
  };

  const postCtx = usePostInput();

  const postText = async () => {
    if (isSending()) return;
    setIsSending(true);

    // 何も入力されていない場合は何もしない
    if (content() === "" && fileUpload().acceptedFiles.length === 0) {
      setIsSending(false);
      return;
    }

    // ファイルをアップロード
    let iMetaTags: string[][] = [];
    let fileUrls: string[] = [];
    if (fileUpload().acceptedFiles.length > 0) {
      if (serverConfig.state !== "ready") {
        toast.error(t("noFileServerConfigured"));
        setIsSending(false);
        return;
      }
      const apiUrl = serverConfig().api_url;
      try {
        const resized = await Promise.all(
          fileUpload().acceptedFiles.map((file) => resize(file)),
        );
        const uploadRes = await uploadFiles(resized, apiUrl);
        iMetaTags = uploadRes
          .map((res) => fileUploadResToImetaTag(res))
          .filter((v): v is NonNullable<typeof v> => !!v);
        fileUrls = uploadRes
          .map((res) => extractFileUrl(res))
          .filter((v): v is NonNullable<typeof v> => !!v);
      } catch (e) {
        console.error(e);
        setIsSending(false);
        return;
      }
    }

    // テキストを投稿
    const textContent =
      fileUrls.length > 0 ? `${content()}\n${fileUrls.join("\n")}` : content();

    await sendShortText({
      content: textContent,
      tags: referenceTags().concat(iMetaTags),
    });

    setIsSending(false);
    setContent("");
    fileUpload().clearFiles();
    fileUpload().clearRejectedFiles();

    // モーダル投稿欄から投稿していたらモーダルを閉じる
    if (postCtx) {
      postCtx.closePostInput();
    }
  };

  return (
    <Show
      when={isLogged()}
      fallback={<NeedLoginPlaceholder message={t("postInput.needLogin")} />}
    >
      <FileUpload.RootProvider value={fileUpload}>
        <FileUpload.HiddenInput />
        <div class="max-w-150 space-y-2 p-2">
          <div
            class="b-1 relative rounded bg-secondary p-2 outline-accent-5 focus-within:outline"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragStart={onDragStart}
            onDragLeave={onDragLeave}
          >
            <div class="relative h-fit">
              <div class={textareaStyle} aria-hidden>
                {`${content()}\u200b`}
              </div>
              <textarea
                use:autofocus
                autofocus
                ref={setTextarea}
                class={`${textareaStyle} disabled:op-50 absolute top-0 left-0 h-full bg-transparent focus:outline-none disabled:cursor-progress`}
                placeholder={t("postInput.placeholder")}
                value={content()}
                disabled={isSending()}
                onInput={(e) => setContent(e.currentTarget.value)}
                onKeyDown={handleCtrlEnter}
                onPaste={onPaste}
              />
            </div>

            <span class="c-secondary text-caption">
              {t("postInput.enterToAddNewLine")}
            </span>
            <Show when={isDragging() && canDrop() && !isSending()}>
              <div class="b-2 b-accent-5 b-dashed absolute inset-0 flex flex-col items-center justify-center rounded backdrop-blur-2">
                <div class="i-material-symbols:upload-file-outline-rounded aspect-square h-1lh w-auto" />
                {t("postInput.fileUpload.dropFile")}
              </div>
            </Show>
            <Show when={isSending()}>
              <div class="absolute inset-0 flex flex-col items-center justify-center rounded backdrop-blur-2">
                <Progress value={fileUploadProgress()} class="w-75%">
                  <Progress.Track class="b-2 h-4 rounded-full">
                    <Progress.Fill class="h-full w-[--kb-progress-fill-width] rounded-full bg-accent-primary transition-50 transition-width" />
                  </Progress.Track>
                </Progress>
              </div>
            </Show>
          </div>
          <FileUpload.ItemGroup class="children-shrink-0 flex w-full gap-1 overflow-x-auto">
            <FileUpload.Context>
              {(context) => (
                <For each={context().acceptedFiles}>
                  {(file) => (
                    <FileUpload.Item
                      file={file}
                      title={file.name}
                      class="b-1 relative grid h-48 max-w-48 grid-rows-[minmax(0,1fr)_auto] gap-1 rounded bg-primary p-1"
                    >
                      <div class="h-full w-full overflow-hidden rounded bg-secondary p-1">
                        <FileUpload.ItemPreview
                          class="h-full w-full"
                          type="image/*"
                        >
                          <FileUpload.ItemPreviewImage class="h-full w-full object-contain" />
                        </FileUpload.ItemPreview>
                        <FileUpload.ItemPreview
                          class="grid h-full w-full place-items-center p-4"
                          type="video/*"
                        >
                          {/* TODO: video preview */}
                          <div class="i-material-symbols:video-file-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                        <FileUpload.ItemPreview
                          class="grid h-full w-full place-items-center p-4"
                          type="audio/*"
                        >
                          <div class="i-material-symbols:audio-file-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                        {/* image, video, audio以外にマッチ */}
                        <FileUpload.ItemPreview
                          class="grid h-full w-full place-items-center p-4"
                          type="^(?!(image)|(video)|(audio)).*"
                        >
                          <div class="i-material-symbols:file-present-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                      </div>
                      <div class="flex w-full items-baseline justify-between gap-2 overflow-hidden">
                        <FileUpload.ItemName class="truncate" />
                        <FileUpload.ItemSizeText
                          class="shrink-0 break-keep text-caption"
                          classList={{
                            "c-yellow-6 dark:c-yellow-5": needResize(file),
                            "c-secondary": !needResize(file),
                          }}
                          title={
                            needResize(file)
                              ? t("postInput.fileUpload.needResize", {
                                  maxSizeMB,
                                })
                              : undefined
                          }
                        />
                      </div>
                      <FileUpload.ItemDeleteTrigger
                        disabled={isSending()}
                        class="c-primary enabled:hover:c-red-5 disabled:op-50 absolute top-1 right-1 rounded-full bg-secondary p-1"
                      >
                        <div class="i-material-symbols:close-rounded aspect-square h-4 w-auto" />
                      </FileUpload.ItemDeleteTrigger>
                    </FileUpload.Item>
                  )}
                </For>
              )}
            </FileUpload.Context>
          </FileUpload.ItemGroup>
          <div class="flex gap-2">
            <FileUpload.Trigger
              disabled={isSending() || serverConfig.state !== "ready"}
              class="inline-flex shrink-0 appearance-none items-center justify-center rounded-full bg-accent-primary p-1 text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover disabled:opacity-50"
              title={serverConfig.error ? t("noFileServerConfigured") : ""}
            >
              <div class="i-material-symbols:add-photo-alternate-outline-rounded aspect-square h-1lh w-auto" />
            </FileUpload.Trigger>
            <Popover>
              <Popover.Trigger
                class="inline-flex shrink-0 appearance-none items-center justify-center rounded-full bg-accent-primary p-1 text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover disabled:opacity-50"
                disabled={isSending()}
              >
                <div class="i-material-symbols:add-reaction-outline-rounded aspect-square h-1lh w-auto" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="transform-origin-[var(--kb-popover-content-transform-origin)] outline-none">
                  <EmojiPicker
                    onSelect={(v) => {
                      insertText(v.native ?? v.shortcodes);
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover>
            <div class="ml-auto">
              <Button onClick={postText} disabled={isSending()}>
                {t("postInput.post")}
                <div class="i-material-symbols:send-rounded m--0.125lh aspect-square h-1.25lh w-auto" />
              </Button>
            </div>
          </div>
          <div class="flex flex-col gap-1 overflow-auto">
            <div class="c-secondary">{t("postInput.preview")}</div>
            <div class="b-1 min-h-20">
              <PostPreview
                content={debouncedContent()}
                tags={[...flatEmojis(), ...tagsForPreview()]}
              />
            </div>
            <div class="c-secondary text-caption">{t("postInput.note")}</div>
          </div>
        </div>
      </FileUpload.RootProvider>
    </Show>
  );
};

export default PostInput;
