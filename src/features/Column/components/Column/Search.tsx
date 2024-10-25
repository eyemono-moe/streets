import type { Filter } from "nostr-tools";
import { type Component, Show, createSignal } from "solid-js";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import Button from "../../../../shared/components/UI/Button";
import { TextField } from "../../../../shared/components/UI/TextField";
import { queryObjectToNostrFilter } from "../../../Search/lib/parseSearchQuery";
import { useQueryParser } from "../../../Search/lib/useQueryParser";
import { useColumn } from "../../context/column";
import type { ColumnContent } from "../../libs/deckSchema";
import ColumnHeader from "../ColumnHeader";

const Search: Component<{
  state: ColumnContent<"search">;
  showHeader?: boolean;
}> = (props) => {
  const t = useI18n();
  const updateColumn = useColumn()?.[1].updateColumn;
  const handleInput = (e: Event) => {
    updateColumn?.((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        query: (e.target as HTMLInputElement).value,
      },
    }));
  };

  const parser = useQueryParser();
  const genSearchFilter = async () => {
    const parsed = await parser(props.state.query);
    const filter = queryObjectToNostrFilter(parsed);
    return filter;
  };

  const [filter, setFilter] = createSignal<Filter | undefined>();

  const handleSearch = async () => {
    setFilter(await genSearchFilter());
  };

  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Show when={props.showHeader}>
        <ColumnHeader title={t("column.search.title")} />
      </Show>
      <TextField value={props.state.query} onInput={handleInput} />
      <Button onClick={handleSearch}>search</Button>
      <pre>{JSON.stringify(filter(), null, 2)}</pre>
      <Show when={filter()} keyed>
        {(nonNullFilter) => <InfiniteEvents filter={nonNullFilter} />}
      </Show>
    </div>
  );
};

export default Search;
