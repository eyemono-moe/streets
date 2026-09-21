import { buildColumn } from "@streets/core/deck/column-presets";
import {
  isEmptySearchQuery,
  parseSearchQuery,
} from "@streets/core/search/query";
import { type Component, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SearchForm from "./SearchForm";

/**
 * 探すための入口。カラムを追加する入口とは分けている —— 「今あるものから選ぶ」
 * のと「言葉から探す」のは、やりたいことが違う。
 *
 * 入力欄と項目ごとのフォームは、同じ条件を別の形で触っているだけ。どちらを
 * 変えても、もう一方に反映される。
 */
const SearchPanel: Component = () => {
  const dispatch = useDispatch();
  const [text, setText] = createSignal("");
  const query = () => parseSearchQuery(text());
  const open = () => {
    const column = buildColumn("search", text().trim());
    if (column) dispatch({ type: "deck/add-column", column });
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4">
      <form
        class="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <div class="flex h-10 items-center gap-2 rounded-full border border-primary px-3">
          <span
            class="i-material-symbols:search-rounded c-secondary size-4.5 shrink-0"
            aria-hidden="true"
          />
          <input
            class="c-primary placeholder:c-secondary min-w-0 flex-1 bg-transparent text-body outline-none"
            placeholder="ねこ #nostr from:npub1…"
            aria-label="探すもの"
            autofocus
            value={text()}
            onInput={(event) => setText(event.currentTarget.value)}
          />
        </div>
        <SearchForm query={query()} onChange={setText} />
        <Button
          type="submit"
          variant="primary"
          shape="rounded"
          block
          disabled={isEmptySearchQuery(query())}
        >
          この条件でカラムを開く
        </Button>
      </form>

      <p class="c-secondary text-caption">
        入力欄には # でハッシュタグ、from: で書いた人、since: until: で日付、
        kind: で種類を書けます。上の項目と同じものです。
      </p>
    </div>
  );
};

export default SearchPanel;
