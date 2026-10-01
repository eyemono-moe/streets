import { Popover } from "@ark-ui/solid/popover";
import { type Component, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import IconButton from "../ui/IconButton";
import PopoverTrigger from "../ui/PopoverTrigger";
import { useEmojiGroups } from "./custom-emojis";
import { type PickerEmoji, loadUnicodeEmojis } from "./emoji-data";
import { EmojiPicker } from "./lazy-emoji-picker";
import { rememberEmoji } from "./recent-emoji";

/** 投稿・返信・引用の本文やステータスに入れる絵文字を選ぶ。 */
const ComposeEmojiPicker: Component<{
  disabled: boolean;
  onSelect: (emoji: PickerEmoji) => void;
  field: () => HTMLInputElement | HTMLTextAreaElement | undefined;
}> = (props) => {
  const customGroups = useEmojiGroups();
  // 投稿パネルや返信・引用のダイアログは開いたときに描かれる。ピッカーを開いてから
  // 読み始めると一覧が出るまで待たせるので、書き始めた時点で読んでおく。
  onMount(() => {
    EmojiPicker.preload();
    loadUnicodeEmojis().catch(() => {});
  });
  return (
    <Popover.Root
      lazyMount
      unmountOnExit
      finalFocusEl={() => props.field() ?? null}
      positioning={{ placement: "top-start" }}
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
                />
              )}
            </Popover.Context>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

export default ComposeEmojiPicker;
