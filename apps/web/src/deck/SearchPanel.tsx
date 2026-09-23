import { buildColumn } from "@streets/core/deck/column-presets";
import {
  isEmptySearchQuery,
  parseSearchQuery,
} from "@streets/core/search/query";
import { type Component, createSignal } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SearchQueryEditor from "./SearchQueryEditor";

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
        <SearchQueryEditor text={text()} onChange={setText} autofocus />
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
    </div>
  );
};

export default SearchPanel;
