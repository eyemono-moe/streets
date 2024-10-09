import { Popover } from "@kobalte/core/popover";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import EmojiPicker from "../../../components/EmojiPicker";
import { useI18n } from "../../../i18n";
import { showLoginModal } from "../../../libs/nostrLogin";
import type { EmojiTag } from "../../../libs/parser/commonTag";
import { useEmojis, useSendShortText } from "../../../libs/rxQuery";
import { isLogged, useMyPubkey } from "../../../libs/useMyPubkey";
import PostPreview from "./PostPreview";

const PostInput: Component<{
  defaultContent?: string;
}> = (props) => {
  // TODO: reply target, image upload, pubkey/emoji auto complete

  const t = useI18n();

  const [content, setContent] = createSignal(props.defaultContent ?? "");
  const [textarea, setTextarea] = createSignal<HTMLTextAreaElement>();

  const { sendShortText, sendState } = useSendShortText();

  const postText = async () => {
    if (content() === "") {
      return;
    }
    await sendShortText({
      content: content(),
    });
    setContent("");
  };

  const myPubkey = useMyPubkey();
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
    "b-1 rounded p-2 w-full resize-none min-h-30 focus:outline block overflow-hidden break-anywhere whitespace-pre-wrap";

  return (
    <Show
      when={isLogged()}
      fallback={
        <div class="flex h-full w-full flex-col items-center justify-center">
          <div>{t("postInput.needLogin")}</div>
          <button
            onClick={showLoginModal}
            type="button"
            class="inline-flex cursor-pointer appearance-none items-center justify-center gap-1 rounded-full px-4 py-1 font-700"
          >
            {t("postInput.login")}
          </button>
        </div>
      }
    >
      <div class="space-y-2 p-2">
        <div class="relative h-fit">
          <div class={textareaStyle} aria-hidden>
            {`${content()}\u200b`}
          </div>
          <textarea
            ref={setTextarea}
            class={`${textareaStyle} absolute top-0 left-0 h-full focus:outline-2 focus:outline-purple disabled:cursor-progress disabled:bg-zinc-2`}
            placeholder={t("postInput.placeholder")}
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
            disabled={sendState.sending}
          />
        </div>
        <div class="flex">
          <Popover>
            <Popover.Trigger
              class="c-white inline-flex w-fit items-center justify-center gap-1 rounded-full bg-purple-5 p-1 font-500 enabled:hover:bg-purple-6"
              disabled={sendState.sending}
            >
              <div class="i-material-symbols:add-reaction-outline-rounded aspect-square h-6 w-auto" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content class="transform-origin-[var(--kb-popover-content-transform-origin)] z-50 outline-none">
                <EmojiPicker
                  onSelect={(v) => {
                    insertEmoji(v.native ?? v.shortcodes);
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover>
          <button
            type="button"
            onClick={postText}
            class="c-white ml-auto inline-flex w-fit items-center justify-center gap-1 rounded-full bg-purple-5 px-2 py-1 font-500 enabled:hover:bg-purple-6 disabled:cursor-progress disabled:bg-zinc-4"
            disabled={sendState.sending}
          >
            {t("postInput.post")}
            <div class="i-material-symbols:send-rounded aspect-square h-4 w-auto" />
          </button>
        </div>
        <div class="flex flex-col gap-1">
          <div class="text-zinc-5">{t("postInput.preview")}</div>
          <div class="b-1 min-h-20 p-2">
            <PostPreview content={content()} tags={flatEmojis()} />
          </div>
          <div class="text-3 text-zinc-5">{t("postInput.note")}</div>
        </div>
      </div>
    </Show>
  );
};

export default PostInput;
