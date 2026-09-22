import { emojiSetAddress } from "@streets/core/settings/emoji-list";
import { parseEmojiSet } from "@streets/core/settings/emoji-set";
import {
  type EmojiSetQuery,
  emojiSetFilters,
  parseEmojiSetQuery,
} from "@streets/core/settings/emoji-set-search";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useCustomEmojis } from "../emoji/custom-emojis";
import { useReadLayer } from "../read-layer";
import EmojiSetSearchView, { type EmojiSetResult } from "./EmojiSetSearchView";
import { useSearchRelays } from "./SearchRelayMediator";

/**
 * 絵文字セットを探す。問い合わせはカラムと同じ読み取り層に載せる ——
 * 言葉での検索は検索に答えるリレーへ、人や住所での指定はその人のリレーへ
 * 行き先が変わる。
 */
const EmojiSetSearch: Component = () => {
  const [query, setQuery] = createSignal<EmojiSetQuery>();
  const [error, setError] = createSignal<string>();

  const search = (text: string) => {
    const next = parseEmojiSetQuery(text);
    if (!next) {
      setError(
        text.trim() === ""
          ? "探すものを入力してください"
          : "絵文字セットの住所（naddr）ではありません",
      );
      setQuery(undefined);
      return;
    }
    setError(undefined);
    setQuery(next);
  };

  return (
    <Show
      when={query()}
      fallback={
        <EmojiSetSearchView
          results={[]}
          searching={false}
          searched={false}
          disabled={false}
          error={error()}
          onSearch={search}
        />
      }
    >
      {/* 探すたびに購読を作り直す。前の結果を混ぜない。 */}
      {(query) => <Results query={query()} error={error()} onSearch={search} />}
    </Show>
  );
};

const Results: Component<{
  query: EmojiSetQuery;
  error: string | undefined;
  onSearch: (text: string) => void;
}> = (props) => {
  const { manager } = useReadLayer();
  const emojis = useCustomEmojis();
  const searchRelays = useSearchRelays();

  const section = manager
    ? createSection({
        manager,
        source: () => ({
          type: "nostr",
          filters: emojiSetFilters(props.query),
          // 言葉での検索だけは行き先を決められない（著者を指定しないため）。
          relays:
            props.query.kind === "words"
              ? [...(searchRelays?.relays() ?? [])]
              : undefined,
        }),
      })
    : undefined;

  const added = (address: string) =>
    (emojis?.list().sets ?? []).some((ref) => emojiSetAddress(ref) === address);

  const results = createMemo<EmojiSetResult[]>(() => {
    const seen = new Set<string>();
    const out: EmojiSetResult[] = [];
    for (const event of section?.items() ?? []) {
      const set = parseEmojiSet(event);
      if (!set) continue;
      const address = emojiSetAddress(set);
      if (seen.has(address)) continue;
      seen.add(address);
      out.push({ set, added: added(address) });
    }
    return out;
  });

  return (
    <EmojiSetSearchView
      results={results()}
      searching={section?.status().phase !== "settled"}
      searched
      disabled={emojis?.saving() ?? false}
      error={props.error}
      onSearch={props.onSearch}
    />
  );
};

export default EmojiSetSearch;
