import {
  type SearchHistory,
  searchHistoryParts,
} from "@streets/core/search/history";
import { type Component, For, Match, Switch } from "solid-js";
import Name from "../note/Name";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";

/** 条件の文字列。人の指定は鍵のままでは読めないので、名前に置き換えて見せる。 */
const QueryText: Component<{ query: string }> = (props) => (
  <For each={searchHistoryParts(props.query)}>
    {(part, index) => (
      <>
        {index() > 0 && " "}
        <Switch>
          <Match when={part.type === "person" && part}>
            {(person) => (
              <>
                {person().prefix}@
                <Name pubkey={person().pubkey} />
              </>
            )}
          </Match>
          <Match when={part.type === "text" && part}>
            {(text) => text().text}
          </Match>
        </Switch>
      </>
    )}
  </For>
);

/** 前に探した条件。押すとその条件ですぐ探す。 */
const SearchHistoryList: Component<{
  history: SearchHistory;
  onPick: (query: string) => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <section class="flex flex-col py-2" aria-label="最近の検索">
      <div class="flex items-center gap-2 py-1 pr-2 pl-3">
        <h3 class="c-secondary min-w-0 flex-1 font-600 text-caption">
          最近の検索
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "search/history-clear" })}
        >
          すべて消す
        </Button>
      </div>
      <ul class="flex flex-col">
        <For each={props.history}>
          {(query) => (
            <li class="flex items-center gap-1 pr-2 hover:bg-secondary">
              <button
                type="button"
                class="c-primary flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent py-2 pl-3 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
                onClick={() => props.onPick(query)}
              >
                <span
                  class="i-material-symbols:history-rounded c-secondary size-4.5 shrink-0"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate">
                  <QueryText query={query} />
                </span>
              </button>
              <IconButton
                size="sm"
                icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                label={`「${query}」を履歴から外す`}
                title="履歴から外す"
                onClick={() =>
                  dispatch({ type: "search/history-remove", query })
                }
              />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
};

export default SearchHistoryList;
