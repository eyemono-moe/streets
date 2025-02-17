import { Picker } from "emoji-mart";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import type { Emoji } from ".";
import { useMe } from "../../../context/me";
import { useEmojis } from "../../libs/query";

type Props = {
  onSelect?: (emoji: Emoji) => void;
};

type CustomEmojiGroup = {
  id: string;
  name: string;
  emojis: {
    id: string;
    name: string;
    skins: {
      src: string;
    }[];
  }[];
};

const EmojiPicker: Component<Props> = (props) => {
  const [{ myPubkey }] = useMe();
  const { emojiList, emojiSets } = useEmojis(myPubkey);
  const customEmojis = createMemo<CustomEmojiGroup[]>(() => {
    return emojiSets()
      .map((emojiSet) => {
        const set = emojiSet().data;
        if (!set) return;
        return {
          id: set.raw.id,
          name: set.parsed.identifier,
          emojis: set.parsed.emojis.map((emoji) => {
            return {
              id: emoji.name,
              name: emoji.name,
              skins: [
                {
                  src: emoji.url,
                },
              ],
            };
          }),
        };
      })
      .filter((x): x is Exclude<typeof x, undefined> => !!x)
      .concat([
        {
          id: "myList",
          name: "MyList",
          emojis:
            emojiList().data?.parsed.emojis.map((emoji) => {
              return {
                id: emoji.name,
                name: emoji.name,
                skins: [
                  {
                    src: emoji.url,
                  },
                ],
              };
            }) ?? [],
        },
      ]);
  });

  const [ref, setRef] = createSignal<HTMLElement>();
  const picker = new Picker({
    data: async () => {
      const response = await fetch(
        "https://cdn.jsdelivr.net/npm/@emoji-mart/data",
      );
      return response.json();
    },
    custom: customEmojis(),
    set: "native",
    onEmojiSelect: (v: Emoji) => {
      props.onSelect?.(v);
    },
  });

  createEffect(() => {
    picker.update({
      custom: customEmojis(),
    });
  });

  onMount(() => {
    // @ts-ignore
    ref()?.appendChild(picker);
  });

  return <div ref={setRef} />;
};

export default EmojiPicker;
