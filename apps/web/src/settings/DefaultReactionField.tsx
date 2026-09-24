import { Popover } from "@ark-ui/solid/popover";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import { type Component, Show } from "solid-js";
import { Portal } from "solid-js/web";
import EmojiPicker from "../emoji/EmojiPicker";
import { reactionInputOf } from "../emoji/ReactionPicker";
import { useEmojiGroups } from "../emoji/custom-emojis";
import { rememberEmoji } from "../emoji/recent-emoji";
import ReactionButtonMark from "../note/ReactionButtonMark";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

const nameOf = (input: ReactionInput): string =>
  input.type === "like"
    ? "ハート"
    : input.type === "text"
      ? input.content
      : `:${input.shortcode}:`;

/** いいねボタンで送る絵文字。ピッカーで選び、× でハートに戻す。 */
const DefaultReactionField: Component<{ value: ReactionInput }> = (props) => {
  const dispatch = useDispatch();
  const customGroups = useEmojiGroups();
  const set = (input: ReactionInput) =>
    dispatch({ type: "deck/set-default-reaction", input });

  return (
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="c-accent-5 grid h-9 min-w-9 place-items-center rounded-2 border border-primary bg-primary px-2 text-caption"
        title={nameOf(props.value)}
      >
        <ReactionButtonMark input={props.value} active />
      </span>
      <Popover.Root
        lazyMount
        unmountOnExit
        positioning={{ placement: "bottom-start" }}
      >
        <Popover.Trigger
          asChild={(triggerProps) => (
            <Button {...triggerProps()} variant="secondary" size="sm">
              絵文字を選ぶ
            </Button>
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
                      rememberEmoji(emoji);
                      set(reactionInputOf(emoji));
                      api().setOpen(false);
                    }}
                  />
                )}
              </Popover.Context>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <Show when={props.value.type !== "like"}>
        <Button
          variant="ghost"
          size="sm"
          icon="i-material-symbols:close-rounded"
          aria-label="ハートに戻す"
          title="ハートに戻す"
          onClick={() => set({ type: "like" })}
        />
      </Show>
    </div>
  );
};

export default DefaultReactionField;
