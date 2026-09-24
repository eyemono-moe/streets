import { Popover } from "@ark-ui/solid/popover";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component, JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useDispatch } from "../ui-events";
import PopoverTrigger from "../ui/PopoverTrigger";
import { useEmojiGroups } from "./custom-emojis";
import type { PickerEmoji } from "./emoji-data";
import { EmojiPicker } from "./lazy-emoji-picker";
import { rememberEmoji } from "./recent-emoji";

/**
 * 押せる要素をそのままトリガーにするための、Ark UI から渡ってくる props。
 * 戻り値の要素型は Ark UI 側が `any` で持つので、そこに合わせる。
 */
export type PickerTrigger = (
  userProps?: JSX.IntrinsicElements["button"],
  // biome-ignore lint/suspicious/noExplicitAny: Ark UI の `asChild` の型に合わせる
) => JSX.HTMLAttributes<any>;

export const reactionInputOf = (emoji: PickerEmoji): ReactionInput =>
  emoji.kind === "unicode"
    ? { type: "text", content: emoji.char }
    : { type: "emoji", shortcode: emoji.shortcode, url: emoji.url };

/**
 * リアクションに使う絵文字を選ぶ。選んだらそのまま送る —— 確認を挟むほどの
 * 操作ではなく、v0 でも選んだ時点で送っていた。
 */
const ReactionPicker: Component<{
  target: NostrEvent;
  trigger: (props: PickerTrigger) => JSX.Element;
}> = (props) => {
  const dispatch = useDispatch();
  const customGroups = useEmojiGroups();
  return (
    // 閉じている間は中身を作らない（絵文字は 1900 件あり、投稿ごとに 2 か所ある）。
    <Popover.Root
      lazyMount
      unmountOnExit
      positioning={{ placement: "bottom-start" }}
    >
      <PopoverTrigger asChild={props.trigger} />
      <Portal>
        <Popover.Positioner>
          <Popover.Content class="motion-pop outline-none">
            <Popover.Context>
              {(api) => (
                <EmojiPicker
                  customGroups={customGroups()}
                  onSelect={(emoji) => {
                    rememberEmoji(emoji);
                    dispatch({
                      type: "note/react",
                      target: props.target,
                      input: reactionInputOf(emoji),
                    });
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

export default ReactionPicker;
