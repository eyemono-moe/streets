import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { npubEncode } from "nostr-tools/nip19";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { useMe } from "../../context/me";
import SuggestItem, {
  type EmojiSuggest,
  type UserSuggest,
} from "../components/UI/SuggestItem";
import { type Option, type Target, createAutoComplete } from "./autoComplete";
import { getMatchedWithPriority } from "./basic/array";
import { useEmojis, useUserList } from "./query";

type SuggestType = EmojiSuggest | UserSuggest;

export const createSuggestList = <T extends string>(
  target: Target,
  prefixes: T[],
  options: {
    [K in T]:
      | Option<SuggestType>[]
      | ((query: string) => Option<SuggestType>[])
      | ((query: string) => Promise<Option<SuggestType>[]>);
  },
  minQueryLength = 2,
) => {
  const { candidates, activeIndex, caretPosition, showSuggestion, onSelect } =
    createAutoComplete<T, SuggestType>(
      target,
      prefixes,
      options,
      minQueryLength,
    );
  const [suggestList, setSuggestList] = createSignal<HTMLDivElement>();
  const [listPosition] = createResource(
    () => [caretPosition(), suggestList()] as const,
    async ([caretPos, suggestListEl]) => {
      if (!caretPos || !suggestListEl) return;

      return await computePosition(
        { getBoundingClientRect: () => caretPos },
        suggestListEl,
        {
          placement: "top-end",
          strategy: "fixed",
          middleware: [offset(6), flip(), shift({ padding: 5 })],
        },
      );
    },
  );

  const SuggestList = () => {
    return (
      <Show when={showSuggestion()}>
        <div
          ref={setSuggestList}
          class="b-1 absolute top-0 left-0 z-1 max-h-[min(100vh,160px)] w-64 max-w-100vh overflow-y-auto rounded-2 bg-primary p-1 shadow-lg shadow-ui/25"
          style={{
            transform: `translate3d(${listPosition()?.x}px, ${
              listPosition()?.y
            }px, 0)`,
          }}
        >
          <ul>
            <For each={candidates()} fallback={<li>no candidates</li>}>
              {(item, i) => (
                <SuggestItem
                  item={item.value}
                  highlighted={i() === activeIndex()}
                  onSelect={() => {
                    onSelect(i());
                  }}
                />
              )}
            </For>
          </ul>
        </div>
      </Show>
    );
  };

  return { SuggestList };
};

export const useEmojiOptions = () => {
  const [{ myPubkey }] = useMe();
  const myEmoji = useEmojis(myPubkey);
  const emojis = createMemo(() => {
    return myEmoji.emojiSets().flatMap(
      (emojiSet) =>
        emojiSet().data?.parsed.emojis.map((emoji) => ({
          name: emoji.name,
          url: emoji.url,
        })) ?? [],
    );
  });

  const emojiOption = (query: string): Option<EmojiSuggest>[] => {
    return getMatchedWithPriority(emojis(), query.toLowerCase(), (v) => [
      v.name,
    ])
      .sort((a, b) => a.priority - b.priority)
      .map((v) => ({
        value: {
          type: "emoji",
          name: v.value.name,
          url: v.value.url,
        },
        insertValue: `:${v.value.name}:`,
      }));
  };

  return emojiOption;
};

export const useUserOptions = () => {
  const users = useUserList();
  const nonNullUsers = createMemo(() =>
    users()
      .map((u) => u.data?.parsed)
      .filter((u) => u !== undefined),
  );

  const userOption = (query: string): Option<UserSuggest>[] => {
    return getMatchedWithPriority(nonNullUsers(), query.toLowerCase(), (v) => {
      return [v.name, v.display_name, v.nip05];
    })
      .sort((a, b) => a.priority - b.priority)
      .map((v) => ({
        value: {
          type: "user",
          url: v.value.picture,
          name: v.value.name,
          displayName: v.value.display_name,
        },
        insertValue: `nostr:${npubEncode(v.value.pubkey)}`,
      }));
  };

  return userOption;
};
