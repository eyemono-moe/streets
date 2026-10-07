import { Popover } from "@ark-ui/solid/popover";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import type { Style } from "@streets/core/emoji-maker/style";
import { defaultShortcode, emojiUrl } from "@streets/core/emoji-maker/url";
import { type Component, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import PopoverTrigger from "../ui/PopoverTrigger";
import { useEmojiGroups } from "./custom-emojis";
import { type PickerEmoji, loadUnicodeEmojis } from "./emoji-data";
import { EmojiPicker, MakerFooter } from "./lazy-emoji-picker";
import { lastStyle, rememberLastStyle } from "./maker/last-style";
import { createMakerFlow } from "./maker/maker-flow";
import { rememberEmoji } from "./recent-emoji";

/** 投稿・返信・引用の本文やステータスに入れる絵文字を選ぶ。 */
const ComposeEmojiPicker: Component<{
  disabled: boolean;
  onSelect: (emoji: PickerEmoji) => void;
  field: () => HTMLInputElement | HTMLTextAreaElement | undefined;
}> = (props) => {
  const customGroups = useEmojiGroups();
  const dispatch = useDispatch();
  const maker = createMakerFlow();
  /**
   * 作った絵文字を本文に入れる。名前と URL は見た目から決まるので先に入れ、画像は裏で
   * サーバーに描かせる（できたら、投稿に付ける名前と画像の対応を覚える）。
   */
  const insertMade = (spec: EmojiSpec, style: Style, shortcode: string) => {
    if (props.disabled) return;
    rememberLastStyle(style);
    dispatch({ type: "emoji/prepare-made", spec, shortcode });
    props.onSelect({ kind: "custom", shortcode, url: emojiUrl(spec) });
  };
  // 投稿パネルや返信・引用のダイアログは開いたときに描かれる。ピッカーを開いてから
  // 読み始めると一覧が出るまで待たせるので、書き始めた時点で読んでおく。
  onMount(() => {
    EmojiPicker.preload();
    loadUnicodeEmojis().catch(() => {});
  });
  return (
    <>
      <Popover.Root
        lazyMount
        unmountOnExit
        finalFocusEl={() => props.field() ?? null}
        positioning={{ placement: "top-start" }}
        onExitComplete={maker.onPickerExitComplete}
      >
        <PopoverTrigger
          disabled={props.disabled}
          asChild={(trigger) => (
            <IconButton
              {...trigger()}
              size="md"
              icon="i-material-symbols:add-reaction-outline-rounded"
              label="絵文字を挿入"
            />
          )}
        />
        <Portal>
          <Popover.Positioner>
            <Popover.Content class="motion-pop outline-none">
              <Popover.Context>
                {(api) => (
                  <EmojiPicker
                    customGroups={customGroups()}
                    onSelect={(emoji) => {
                      if (props.disabled) return;
                      rememberEmoji(emoji);
                      props.onSelect(emoji);
                      api().setOpen(false);
                    }}
                    footer={(query) => (
                      <MakerFooter
                        query={query()}
                        verb="insert"
                        sending={props.disabled}
                        lastStyle={lastStyle()}
                        onSend={(spec, style) => {
                          insertMade(spec, style, defaultShortcode(spec));
                          api().setOpen(false);
                        }}
                        onAdjust={(text, candidate) => {
                          maker.requestAdjust(text, candidate);
                          api().setOpen(false);
                        }}
                      />
                    )}
                  />
                )}
              </Popover.Context>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <maker.Dialog
        verb="insert"
        onSend={(spec, style, submit) => {
          insertMade(spec, style, submit.shortcode);
          if (submit.register) {
            dispatch({
              type: "emoji/add-made",
              spec,
              shortcode: submit.shortcode,
            });
          }
        }}
        onRegister={(spec, shortcode) =>
          dispatch({ type: "emoji/add-made", spec, shortcode })
        }
      />
    </>
  );
};

export default ComposeEmojiPicker;
