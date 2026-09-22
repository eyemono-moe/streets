import { EMOJI_SET_RELAYS } from "@streets/core/read/default-relays";
import { emojiSetAddress } from "@streets/core/settings/emoji-list";
import { parseEmojiSet } from "@streets/core/settings/emoji-set";
import {
  EMOJI_SET_SEARCH_LIMIT,
  type EmojiSetQuery,
  emojiSetFilters,
  parseEmojiSetQuery,
} from "@streets/core/settings/emoji-set-search";
import { createSection } from "@streets/core/solid/create-section";
import { type Component, Show, createMemo, createSignal } from "solid-js";
import { useCustomEmojis } from "../emoji/custom-emojis";
import { useReadLayer } from "../read-layer";
import EmojiSetSearchView, { type EmojiSetResult } from "./EmojiSetSearchView";
import { useRelayEdit } from "./RelayMediator";
import { useSearchRelays } from "./SearchRelayMediator";

/**
 * 絵文字セットを探す。問い合わせはカラムと同じ読み取り層に載せる ——
 * 言葉での検索は検索に答えるリレーへ、人や住所での指定はその人のリレーへ
 * 行き先が変わる。
 */
const EmojiSetSearch: Component = () => {
  // 開いた時点で新着を出す。言葉で探しても見つからないことが多く、
  // 「並んでいるものから選ぶ」のが主な探し方になるため。
  const [query, setQuery] = createSignal<EmojiSetQuery>({ kind: "recent" });
  const [error, setError] = createSignal<string>();

  const search = (text: string) => {
    const next = parseEmojiSetQuery(text);
    if (!next) {
      setError("絵文字セットの住所（naddr）ではありません");
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
          recent
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
  const relays = useRelayEdit();

  /**
   * 著者を指定しない問い合わせ（新着・言葉での検索）の行き先。Outbox で
   * 決められないので、自分が読んでいるリレーと、検索リレーと、絵文字セットの
   * ある既定のリレーへまとめて送る —— どれか 1 つでは薄い。
   */
  const openRelays = () => [
    ...new Set([
      ...(relays?.entries() ?? [])
        .filter((entry) => entry.read)
        .map((entry) => entry.url),
      ...(searchRelays?.relays() ?? []),
      ...EMOJI_SET_RELAYS,
    ]),
  ];

  const section = manager
    ? createSection({
        manager,
        pageSize: EMOJI_SET_SEARCH_LIMIT,
        source: () => ({
          type: "nostr",
          filters: emojiSetFilters(props.query),
          relays:
            props.query.kind === "recent" || props.query.kind === "words"
              ? openRelays()
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
      // 中身の無いセットは出さない。作りかけや消したあとのものが混ざる。
      if (!set || set.emojis.length === 0) continue;
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
      recent={props.query.kind === "recent"}
      searching={section?.status().phase !== "settled"}
      searched
      disabled={emojis?.saving() ?? false}
      error={props.error}
      onSearch={props.onSearch}
      onMore={section?.paging() === "idle" ? section?.loadMore : undefined}
    />
  );
};

export default EmojiSetSearch;
