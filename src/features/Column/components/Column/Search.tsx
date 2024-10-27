import {
  createFormStore,
  getValues,
  setValues,
  valiForm,
} from "@modular-forms/solid";
import type { Filter } from "nostr-tools";
import stringify from "safe-stable-stringify";
import {
  type Component,
  Show,
  createReaction,
  createSignal,
  onMount,
} from "solid-js";
import * as v from "valibot";
import { useI18n } from "../../../../i18n";
import InfiniteEvents from "../../../../shared/components/InfiniteEvents";
import Button from "../../../../shared/components/UI/Button";
import { TextField } from "../../../../shared/components/UI/TextField";
import { createSync } from "../../../../shared/libs/createSync";
import SearchQueryDetailForm, {
  searchQueryDetailFormSchema,
  type SearchQueryDetailFormSchema,
} from "../../../Search/components/SearchQueryDetailForm";
import {
  queryObjectToNostrFilter,
  searchQueryObjectToString,
} from "../../../Search/lib/parseSearchQuery";
import { useQueryParser } from "../../../Search/lib/useQueryParser";
import { useColumn } from "../../context/column";
import type { ColumnContent } from "../../libs/deckSchema";
import { useColumnScrollButton } from "../../libs/useColumnScrollButton";
import ColumnHeader from "../ColumnHeader";
const Search: Component<{
  state: ColumnContent<"search">;
  showHeader?: boolean;
}> = (props) => {
  const t = useI18n();

  const parser = useQueryParser();
  const updateColumn = useColumn()?.[1].updateColumn;

  const formStore = createFormStore<SearchQueryDetailFormSchema>({
    validate: valiForm(searchQueryDetailFormSchema),
  });

  const [[query, setQuery], [queryObj]] = createSync(
    () => {
      return props.state.query;
    },
    (query) => {
      updateColumn?.((prev) => ({
        ...prev,
        content: {
          ...prev.content,
          query,
        },
      }));
    },
    () => {
      const rawValue = getValues(formStore, { shouldActive: false });
      // return rawValue
      const parsed = v.safeParse(searchQueryDetailFormSchema, rawValue);
      if (parsed.success) {
        return parsed.output;
      }
      console.log(parsed.issues);
      return {};
    },
    (queryObj) => {
      setValues(formStore, queryObj);
    },
    {
      ltr: (query) => parser(query),
      rtl: (queryObj) => searchQueryObjectToString(queryObj),
    },
  );

  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setQuery(target.value);
  };

  const [filter, setFilter] = createSignal<Filter | undefined>();
  const isEmptyQuery = (queryObj: SearchQueryDetailFormSchema): boolean => {
    // word以外のいずれかが設定されている場合はfalse
    if (
      queryObj.since ||
      queryObj.until ||
      queryObj.from ||
      queryObj.to ||
      queryObj.hashtag
    ) {
      return false;
    }

    // word以外の値が設定されておらず、wordが空の場合はtrue
    if (queryObj.word === undefined || queryObj.word === "") {
      return true;
    }

    return false;
  };

  const handleSearch = () => {
    const _queryObj = queryObj();
    // filterが空の場合は何もしない
    if (isEmptyQuery(_queryObj)) {
      return;
    }
    const newFilter = queryObjectToNostrFilter(_queryObj);

    // filterが変更されていない場合は何もしない
    if (filter() && stringify(filter()) === stringify(newFilter)) {
      return;
    }

    setFilter(newFilter);
  };

  // マウント後に一度だけ検索を自動実行
  const track = createReaction(() => {
    handleSearch();
  });
  onMount(() => {
    track(() => queryObj());
  });

  const { ScrollButton, setTarget } = useColumnScrollButton();

  return (
    <div
      class="grid h-full w-full divide-y"
      classList={{
        "grid-rows-[auto_minmax(0,1fr)]": props.showHeader,
        "grid-rows-[1fr]": !props.showHeader,
      }}
    >
      <Show when={props.showHeader}>
        <ColumnHeader
          overrideContent={
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
            >
              <TextField value={query()} onInput={handleInput} />
            </form>
          }
        >
          <div class="flex flex-col gap-1 p-2">
            <SearchQueryDetailForm formStore={formStore} />
            <div class="flex w-full justify-end">
              <Button onClick={handleSearch}>
                {t("column.search.search")}
              </Button>
            </div>
          </div>
        </ColumnHeader>
      </Show>
      <div class="overflow-y-auto" ref={setTarget}>
        <ScrollButton />
        <Show
          when={filter()}
          keyed
          fallback={
            <div class="flex h-full w-full items-center justify-center">
              {t("column.search.enterQuery")}
            </div>
          }
        >
          {(nonNullFilter) => (
            <InfiniteEvents
              filter={nonNullFilter}
              // TODO: リレー設定で変更可能にする
              relays={["wss://search.nos.today", "wss://relay.nostr.band"]}
            />
          )}
        </Show>
      </div>
    </div>
  );
};

export default Search;
