import type { Mutation } from "@streets/core/nostr/build/draft";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type CustomEmoji,
  EMOJI_LIST_KIND,
  EMOJI_SET_KIND,
  type EmojiList,
  type EmojiSetRef,
  addEmoji,
  addEmojiSet,
  emojiSetAddress,
  parseEmojiList,
  removeEmoji,
  removeEmojiSet,
} from "@streets/core/settings/emoji-list";
import { type EmojiSet, parseEmojiSet } from "@streets/core/settings/emoji-set";
import { customEmojiGroups } from "@streets/core/view/emoji-catalog";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";
import type { PickerGroup } from "./emoji-data";

export type CustomEmojis = {
  /** ピッカーに出すかたまり。見出しは「自分の絵文字」とセットの名前。 */
  groups: Accessor<PickerGroup[]>;
  /** kind:10030 の中身そのまま（設定の画面で、届いていないセットも出すため）。 */
  list: Accessor<EmojiList>;
  /** 参照しているセットのうち、中身が届いたもの。 */
  sets: Accessor<EmojiSet[]>;
  /** 保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const CustomEmojisContext = createContext<CustomEmojis>();

/**
 * 自分の絵文字（kind:10030）と、そこから参照しているセット（kind:30030）を
 * 集めて、足す・外すを裁定する段。セットは参照を見つけた時点で引きに行く ——
 * ピッカーを開いてから引くと、開いた直後だけカスタム絵文字が無い状態が見える。
 */
export const CustomEmojisMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  list: Accessor<NostrEvent | undefined>;
  fetchLatest: (
    kind: number,
    identifier: string | undefined,
    pubkey: string,
  ) => Promise<NostrEvent | undefined>;
}> = (props) => {
  const [sets, setSets] = createSignal<EmojiSet[]>([]);
  const [saving, setSaving] = createSignal(false);
  const saved = createMemo(() => parseEmojiList(props.list()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<EmojiList>();
  const list = () => pending() ?? saved();

  // 保存が届いたら、先に見せていたものを捨てて本物に戻す。
  createEffect(() => {
    props.list();
    setPending(undefined);
  });

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
      const set = parseEmojiSet(
        await props.fetchLatest(EMOJI_SET_KIND, ref.identifier, ref.pubkey),
      );
      if (!set) return;
      setSets((current) => [...current, set]);
    } catch {
      // 引けなくても、ほかの絵文字は使える。
    }
  };

  const save = (next: EmojiList, mutation: Mutation) => {
    if (saving()) return;
    setSaving(true);
    setPending(next);
    props.writer.replace(EMOJI_LIST_KIND, undefined, mutation).then(
      () => notifySaved("自分の絵文字を保存しました"),
      (cause) => {
        setPending(undefined);
        notifyError(cause, "自分の絵文字を保存できませんでした");
      },
    );
    setSaving(false);
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "emoji/add": {
        const emoji: CustomEmoji = {
          shortcode: event.shortcode,
          url: event.url,
        };
        save(
          {
            ...list(),
            emojis: [
              ...list().emojis.filter(
                (other) => other.shortcode !== emoji.shortcode,
              ),
              emoji,
            ],
          },
          addEmoji(emoji),
        );
        return true;
      }
      case "emoji/remove":
        save(
          {
            ...list(),
            emojis: list().emojis.filter(
              (emoji) => emoji.shortcode !== event.shortcode,
            ),
          },
          removeEmoji(event.shortcode),
        );
        return true;
      case "emoji-set/add": {
        const address = emojiSetAddress(event.ref);
        if (list().sets.some((ref) => emojiSetAddress(ref) === address)) {
          return true;
        }
        save(
          { ...list(), sets: [...list().sets, event.ref] },
          addEmojiSet(event.ref),
        );
        return true;
      }
      case "emoji-set/remove": {
        const address = emojiSetAddress(event.ref);
        save(
          {
            ...list(),
            sets: list().sets.filter((ref) => emojiSetAddress(ref) !== address),
          },
          removeEmojiSet(event.ref),
        );
        return true;
      }
      default:
        return false;
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
    <CustomEmojisContext.Provider value={{ groups, list, sets, saving }}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </CustomEmojisContext.Provider>
  );
};

export const useCustomEmojis = (): CustomEmojis | undefined =>
  useContext(CustomEmojisContext);

/** ピッカーに出すかたまり。読んでいない場所（Storybook など）では空になる。 */
export const useEmojiGroups = (): Accessor<PickerGroup[]> => {
  const context = useCustomEmojis();
  return context?.groups ?? (() => []);
};
