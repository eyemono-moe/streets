import type { NostrEvent } from "@streets/core/nostr/event";
import { emojiSetAddress } from "@streets/core/settings/emoji-list";
import { parseEmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, Show } from "solid-js";
import ListRow from "../lists/ListRow";
import type { EventSize } from "../note/Event";
import { Notice } from "../note/EventFrame";
import { useCustomEmojis } from "./custom-emojis";
import { EmojiGrid, EmojiSetAddButton } from "./EmojiSetParts";

/**
 * 流れてきた絵文字セット（kind:30030）。その場で自分の絵文字リストに加えられる。
 * 画像を持たないセットが多いので、先頭の絵文字をセットの画像の代わりにする。
 */
const EmojiSetCard: Component<{ event: NostrEvent; size: EventSize }> = (
  props,
) => {
  const emojis = useCustomEmojis();
  const set = () => parseEmojiSet(props.event);
  const image = () =>
    props.event.tags.find((tag) => tag[0] === "image")?.[1] ||
    set()?.emojis[0]?.url;
  const added = (address: string) =>
    emojis?.list().sets.some((ref) => emojiSetAddress(ref) === address) ??
    false;
  return (
    <Show
      when={set()}
      fallback={<Notice>名前の無い絵文字セットは表示できません</Notice>}
    >
      {(set) => (
        <ListRow
          event={props.event}
          size={props.size}
          title={set().title}
          image={image()}
          icon="i-material-symbols:add-reaction-outline-rounded"
          count={`${set().emojis.length} 個`}
        >
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
        </ListRow>
      )}
    </Show>
  );
};

export default EmojiSetCard;
