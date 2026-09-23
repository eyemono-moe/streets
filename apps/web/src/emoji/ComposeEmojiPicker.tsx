import { Popover } from "@ark-ui/solid/popover";
import type { Component } from "solid-js";
import { Portal } from "solid-js/web";
import EmojiPicker from "./EmojiPicker";
import { useEmojiGroups } from "./custom-emojis";
import type { PickerEmoji } from "./emoji-data";
import { rememberEmoji } from "./recent-emoji";

/** 投稿・返信・引用の本文に入れる絵文字を選ぶ。 */
const ComposeEmojiPicker: Component<{
  disabled: boolean;
  onSelect: (emoji: PickerEmoji) => void;
  field: () => HTMLTextAreaElement | undefined;
}> = (props) => {
  const customGroups = useEmojiGroups();
  return (
    <Popover.Root
      lazyMount
      unmountOnExit
      finalFocusEl={() => props.field() ?? null}
      positioning={{ placement: "top-start" }}
    >
      <Popover.Context>
        {(api) => (
          <Popover.Trigger
            type="button"
            aria-label="絵文字を挿入"
            // Ark UI の Trigger は開いている間 aria-controls="false" を出す。返信・引用の
            // ダイアログのフォーカストラップは aria-controls でポップオーバーを自分の一部と
            // 見なすので、正しい値が無いと検索欄へのフォーカスを奪い返してしまう。
            aria-controls={
              api().open ? api().getTriggerProps()["aria-controls"] : undefined
            }
            disabled={props.disabled}
            class="c-secondary grid size-8 place-items-center rounded-2 bg-transparent enabled:cursor-pointer enabled:hover:bg-secondary disabled:opacity-50"
          >
            <span
              class="i-material-symbols:add-reaction-outline-rounded size-5"
              aria-hidden="true"
            />
          </Popover.Trigger>
        )}
      </Popover.Context>
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
