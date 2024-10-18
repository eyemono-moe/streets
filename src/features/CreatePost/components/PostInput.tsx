import { Popover } from "@kobalte/core/popover";
import { autofocus } from "@solid-primitives/autofocus";
import stringify from "safe-stable-stringify";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useMe } from "../../../context/me";
import { useI18n } from "../../../i18n";
import EmojiPicker from "../../../shared/components/EmojiPicker";
import Button from "../../../shared/components/UI/Button";
import { createDebounced } from "../../../shared/libs/createDebounced";
import {
  parseTextContent,
  parsedContents2Tags,
} from "../../../shared/libs/parseTextContent";
import { parseTextNoteTags } from "../../../shared/libs/parser/1_shortTextNote";
import type { EmojiTag } from "../../../shared/libs/parser/commonTag";
import { useEmojis, useSendShortText } from "../../../shared/libs/query";
import NeedLoginPlaceholder from "../../Column/components/NeedLoginPlaceholder";
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

  const insertEmoji = (emoji: string) => {
    const _textarea = textarea();
    if (!_textarea) return;
    const start = _textarea.selectionStart;
    const end = _textarea.selectionEnd;
    const text = content();
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setContent(newText);
    _textarea.focus();
    _textarea.setSelectionRange(start + emoji.length, start + emoji.length);
  };

  const textareaStyle =
    "b-1 rounded px-2 pt-2 pb-6 w-full resize-none min-h-30 focus:outline block overflow-hidden break-anywhere whitespace-pre-wrap";

  const handleCtrlEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      postText();
    }
  };

  return (
    <Show
      when={isLogged()}
      fallback={<NeedLoginPlaceholder message={t("postInput.needLogin")} />}
    >
      <div class="max-w-150 space-y-2 p-2">
        <div class="relative h-fit">
          <div class={textareaStyle} aria-hidden>
            {`${content()}\u200b`}
          </div>
          <textarea
            use:autofocus
            autofocus
            ref={setTextarea}
            class={`${textareaStyle} disabled:op-50 absolute top-0 left-0 h-full bg-secondary focus:outline-2 focus:outline-accent-5 disabled:cursor-progress`}
            placeholder={t("postInput.placeholder")}
            value={content()}
            disabled={sendState.sending}
            onInput={(e) => setContent(e.currentTarget.value)}
            onKeyDown={handleCtrlEnter}
          />
          <span class="c-secondary absolute bottom-1 left-2 text-caption">
            {t("postInput.enterToAddNewLine")}
          </span>
        </div>
        <div class="flex">
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
                    insertEmoji(v.native ?? v.shortcodes);
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
        <div class="flex flex-col gap-1 overflow-auto">
          <div class="c-secondary">{t("postInput.preview")}</div>
          <div class="b-1 min-h-20 p-2">
            <PostPreview
              content={debouncedContent()}
              tags={[...flatEmojis(), ...tagsForPreview()]}
            />
          </div>
          <div class="c-secondary text-caption">{t("postInput.note")}</div>
        </div>
      </div>
    </Show>
  );
};

export default PostInput;
