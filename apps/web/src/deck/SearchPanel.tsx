import {
  type ColumnPresetKind,
  buildColumn,
} from "@streets/core/deck/column-presets";
import { decodeNpub } from "@streets/core/nostr/nip19";
import { type Component, Show, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";

/** 入力から、どの探し方になるかを決める。 */
const kindOf = (query: string): ColumnPresetKind =>
  query.startsWith("#") ? "hashtag" : decodeNpub(query) ? "user" : "search";

const META: Record<ColumnPresetKind, { icon: string; description: string }> = {
  user: {
    icon: "i-material-symbols:person-outline-rounded",
    description: "この人のノートと返信",
  },
  hashtag: {
    icon: "i-material-symbols:tag-rounded",
    description: "このハッシュタグが付いたノート",
  },
  search: {
    icon: "i-material-symbols:search-rounded",
    description: "本文の検索（検索に対応したリレーへ問い合わせます）",
  },
  home: { icon: "i-material-symbols:home-outline-rounded", description: "" },
  notifications: {
    icon: "i-material-symbols:notifications-outline-rounded",
    description: "",
  },
  bookmarks: {
    icon: "i-material-symbols:bookmark-outline-rounded",
    description: "",
  },
};

/**
 * 探すための入口。カラムを追加する入口とは分けている —— 「今あるものから選ぶ」
 * のと「言葉から探す」のは、やりたいことが違う。
 *
 * 見つけたものはカラムとして開く。デッキに残るので、あとから閉じられる。
 */
const SearchPanel: Component = () => {
  const dispatch = useDispatch();
  const [query, setQuery] = createSignal("");
  const trimmed = () => query().trim();
  const column = () =>
    trimmed().length > 0
      ? buildColumn(kindOf(trimmed()), trimmed())
      : undefined;
  const meta = () => META[kindOf(trimmed())];
  const open = () => {
    const found = column();
    if (found) dispatch({ type: "deck/add-column", column: found });
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <form
        class="flex h-10 items-center gap-2 rounded-full border border-primary px-3"
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <span
          class="i-material-symbols:search-rounded c-secondary size-4.5 shrink-0"
          aria-hidden="true"
        />
        <input
          class="c-primary placeholder:c-secondary min-w-0 flex-1 bg-transparent text-body outline-none"
          placeholder="ノートの本文・#ハッシュタグ・npub"
          aria-label="探すもの"
          autofocus
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </form>

      <Show
        when={column()}
        fallback={
          <p class="c-secondary mt-3 text-caption">
            言葉を入れると、その結果をカラムとして開きます。# で始めると
            ハッシュタグ、npub や nprofile を貼るとその人のノートです。
          </p>
        }
      >
        {(found) => (
          <div class="mt-2 overflow-hidden rounded-2 border border-primary">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 bg-primary px-3 py-2.5 text-left hover:bg-secondary"
              onClick={open}
            >
              <span
                class={`c-secondary size-4.5 shrink-0 ${meta().icon}`}
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-600 text-body">{found().title}</span>
                <span class="c-secondary truncate text-caption">
                  {meta().description}
                </span>
              </span>
              <span
                class="i-material-symbols:chevron-right-rounded c-secondary size-4.5 shrink-0"
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </Show>
    </div>
  );
};

export default SearchPanel;
