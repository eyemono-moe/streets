import type { NostrEvent } from "@streets/core/nostr/event";
import { emojiSetAddress } from "@streets/core/settings/emoji-list";
import { parseEmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, Show } from "solid-js";
import type { EventSize } from "../note/Event";
import { Notice } from "../note/EventFrame";
import { useCustomEmojis } from "./custom-emojis";
import { EmojiGrid, EmojiSetAddButton, EmojiSetHeading } from "./EmojiSetParts";

/**
 * 流れてきた絵文字セット（kind:30030）。設定の「絵文字セットを探す」と同じ形で、
 * その場で自分の絵文字リストに加えられる。
 */
const EmojiSetCard: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const emojis = useCustomEmojis();
  const set = () => parseEmojiSet(props.event);
  const added = (address: string) =>
    emojis?.list().sets.some((ref) => emojiSetAddress(ref) === address) ??
    false;
  return (
    <Show
      when={set()}
      fallback={<Notice>名前の無い絵文字セットは表示できません</Notice>}
    >
      {(set) => (
        <div
          class="flex flex-col gap-2"
          classList={{
            "rounded-2 border border-primary px-3 py-2.5":
              props.size === "normal",
          }}
        >
          <EmojiSetHeading
            title={set().title}
            pubkey={set().pubkey}
            count={set().emojis.length}
          />
          <EmojiGrid emojis={set().emojis} />
          {/* 引用の中（compact）は読むためのもので、そこから操作させない。 */}
          <Show when={emojis && props.size === "normal" && emojis}>
            {(emojis) => (
              <div class="flex">
                <EmojiSetAddButton
                  set={set()}
                  added={added(emojiSetAddress(set()))}
                  disabled={emojis().saving()}
                />
              </div>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
};

export default EmojiSetCard;
