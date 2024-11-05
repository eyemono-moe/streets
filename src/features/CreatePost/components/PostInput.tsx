import { FileUpload, useFileUpload } from "@ark-ui/solid/file-upload";
import { Popover } from "@kobalte/core/popover";
import { autofocus } from "@solid-primitives/autofocus";
import stringify from "safe-stable-stringify";
import { type Component, For, Show, createMemo, createSignal } from "solid-js";
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
import NeedLoginPlaceholder from "../../Column/components/NeedLoginPlaceholder";
import { useFileDrop } from "../lib/useFileDrop";
import ImagePreview from "./ImagePreview";
import PostPreview from "./PostPreview";

// prevents from being tree-shaken by TS
autofocus;

const PostInput: Component<{
  defaultContent?: string;
  tags?: string[][];
}> = (props) => {
  // TODO: reply target, image upload, pubkey/emoji auto complete

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

  const { sendShortText, sendState } = useSendShortText();
  const postText = async () => {
    if (content() === "") {
      return;
    }
    await sendShortText({
      content: content(),
      tags: referenceTags(),
    });
    setContent("");
  };

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

  const { isDragging, onDrop, canDrop, onDragOver, onDragLeave, onDragStart } =
    useFileDrop((textOrFiles) => {
      if (typeof textOrFiles === "string") {
        insertText(textOrFiles);
      } else {
        addAttachment(textOrFiles);
      }
    });

  const fileUpload = useFileUpload({
    maxFiles: Number.POSITIVE_INFINITY,
    capture: "environment",
    directory: false,
  });
  const addAttachment = (files: File[]) => {
    fileUpload().setFiles(files);
  };

  return (
    <Show
      when={isLogged()}
      fallback={<NeedLoginPlaceholder message={t("postInput.needLogin")} />}
    >
      <FileUpload.RootProvider value={fileUpload}>
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
                disabled={sendState.sending}
                onInput={(e) => setContent(e.currentTarget.value)}
                onKeyDown={handleCtrlEnter}
                onPaste={onPaste}
              />
            </div>

            <span class="c-secondary text-caption">
              {t("postInput.enterToAddNewLine")}
            </span>
            <Show when={isDragging() && canDrop()}>
              <div class="b-2 b-accent-5 b-dashed absolute inset-0 flex flex-col items-center justify-center rounded backdrop-blur-2">
                <div class="i-material-symbols:upload-file-outline-rounded aspect-square h-1lh w-auto" />
                {t("postInput.dropFile")}
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
                          {/* <FileUpload.ItemPreviewImage /> */}
                          <ImagePreview file={file} />
                        </FileUpload.ItemPreview>
                        <FileUpload.ItemPreview
                          class="h-full w-full p-4"
                          type="video/*"
                        >
                          {/* TODO: video preview */}
                          <div class="i-material-symbols:video-file-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                        <FileUpload.ItemPreview
                          class="h-full w-full p-4"
                          type="audio/*"
                        >
                          <div class="i-material-symbols:audio-file-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                        {/* image, video, audio以外にマッチ */}
                        <FileUpload.ItemPreview
                          class="h-full w-full p-4"
                          type="^(?!(image)|(video)|(audio)).*"
                        >
                          <div class="i-material-symbols:file-present-outline-rounded aspect-square h-full w-auto" />
                        </FileUpload.ItemPreview>
                      </div>
                      <div class="flex w-full items-baseline justify-between gap-2 overflow-hidden">
                        <FileUpload.ItemName class="truncate" />
                        <FileUpload.ItemSizeText class="c-secondary shrink-0 break-keep text-caption" />
                      </div>
                      <FileUpload.ItemDeleteTrigger class="c-primary hover:c-red-5 absolute top-1 right-1 rounded-full bg-secondary p-1">
                        <div class="i-material-symbols:close-rounded aspect-square h-4 w-auto" />
                      </FileUpload.ItemDeleteTrigger>
                    </FileUpload.Item>
                  )}
                </For>
              )}
            </FileUpload.Context>
          </FileUpload.ItemGroup>
          <div class="flex gap-2">
            <FileUpload.Trigger class="inline-flex shrink-0 appearance-none items-center justify-center rounded-full bg-accent-primary p-1 text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover">
              <div class="i-material-symbols:add-photo-alternate-outline-rounded aspect-square h-1lh w-auto" />
            </FileUpload.Trigger>
            <Popover>
              <Popover.Trigger
                class="inline-flex shrink-0 appearance-none items-center justify-center rounded-full bg-accent-primary p-1 text-white active:bg-accent-active not-active:enabled:hover:bg-accent-hover"
                disabled={sendState.sending}
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
              <Button onClick={postText} disabled={sendState.sending}>
                {t("postInput.post")}
                <div class="i-material-symbols:send-rounded aspect-square h-4 w-auto" />
              </Button>
            </div>
          </div>
          <FileUpload.HiddenInput />
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
