import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type EmojiSetRef,
  emojiSetAddress,
  parseEmojiList,
} from "@streets/core/settings/emoji-list";
import { EMOJI_SET_KIND } from "@streets/core/settings/emoji-list";
import { type EmojiSet, parseEmojiSet } from "@streets/core/settings/emoji-set";
import { customEmojiGroups } from "@streets/core/view/emoji-catalog";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import type { PickerGroup } from "./emoji-data";

type CustomEmojis = {
  /** ピッカーに出すかたまり。見出しは「自分の絵文字」とセットの名前。 */
  groups: Accessor<PickerGroup[]>;
};

const CustomEmojisContext = createContext<CustomEmojis>();

/**
 * 自分の絵文字（kind:10030）と、そこから参照しているセット（kind:30030）を
 * 集める。セットは参照を見つけた時点で引きに行く —— ピッカーを開いてから
 * 引くと、開いた直後だけカスタム絵文字が無い状態が見える。
 */
export const CustomEmojisProvider: ParentComponent<{
  list: Accessor<NostrEvent | undefined>;
  fetchLatest: (
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ) => Promise<NostrEvent | undefined>;
}> = (props) => {
  const [sets, setSets] = createSignal<EmojiSet[]>([]);
  const list = createMemo(() => parseEmojiList(props.list()));

  // 一度引いたセットは引き直さない（同じ参照で何度も走らせない）。
  const asked = new Set<string>();
  createEffect(() => {
    for (const ref of list().sets) {
      const address = emojiSetAddress(ref);
      if (asked.has(address)) continue;
      asked.add(address);
      void fetchSet(ref);
    }
  });

  const fetchSet = async (ref: EmojiSetRef) => {
    try {
      const event = await props.fetchLatest(
        EMOJI_SET_KIND,
        ref.identifier,
        ref.pubkey,
      );
      const set = parseEmojiSet(event);
      if (!set) return;
      setSets((current) => [...current, set]);
    } catch {
      // 引けなくても、ほかの絵文字は使える。
    }
  };

  const groups = createMemo<PickerGroup[]>(() =>
    customEmojiGroups(list(), sets()).map((group) => ({
      id: group.id,
      title: group.title,
      emojis: group.emojis.map((emoji) => ({
        kind: "custom" as const,
        shortcode: emoji.shortcode,
        url: emoji.url,
      })),
    })),
  );

  return (
    <CustomEmojisContext.Provider value={{ groups }}>
      {props.children}
    </CustomEmojisContext.Provider>
  );
};

/** 自分の絵文字。まだ読んでいない場所（Storybook など）では空になる。 */
export const useCustomEmojis = (): Accessor<PickerGroup[]> => {
  const context = useContext(CustomEmojisContext);
  return context?.groups ?? (() => []);
};
