import { buildColumn } from "@streets/core/deck/column-presets";
import { searchSource } from "@streets/core/deck/column-sources";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ReadLayer } from "@streets/core/read/read-layer";
import {
  PAGE_SIZE,
  type Paging,
  type SectionStatus,
} from "@streets/core/read/source";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  hasSearchExclusions,
  isEmptySearchQuery,
  parseSearchQuery,
  passesSearchExclusions,
} from "@streets/core/search/query";
import { createSection } from "@streets/core/solid/create-section";
import {
  type Accessor,
  type Component,
  Match,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { useListsUnderWarning } from "../content-warning-setting";
import Event from "../note/Event";
import { useBotLookup } from "../note/use-profile";
import { useMutes } from "../settings/MuteMediator";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import VirtualList from "../ui/VirtualList";
import OlderLoader from "./OlderLoader";
import SearchQueryEditor from "./SearchQueryEditor";

/** 結果を確認してから、明示的な操作で検索カラムを追加する。 */
const SearchPanel: Component<{
  readLayer: ReadLayer;
  searchRelays: Accessor<readonly RelayUrl[]>;
}> = (props) => {
  const dispatch = useDispatch();
  const [text, setText] = createSignal("");
  const [searched, setSearched] = createSignal("");
  const query = createMemo(() => parseSearchQuery(searched()));
  const empty = () => isEmptySearchQuery(parseSearchQuery(text()));

  // 入力のたびにリレーへ購読を張り直さない。変換中は editor が上へ渡さない。
  createEffect(() => {
    const next = text().trim();
    if (next === "" || next === searched()) {
      setSearched(next);
      return;
    }
    const timer = setTimeout(() => setSearched(next), 500);
    onCleanup(() => clearTimeout(timer));
  });

  const section = createSection({
    manager: props.readLayer.manager,
    pageSize: PAGE_SIZE,
    source: () =>
      isEmptySearchQuery(query())
        ? undefined
        : searchSource(searched(), props.searchRelays()),
  });
  const isBot = useBotLookup();
  const mutes = useMutes();
  const listsUnderWarning = useListsUnderWarning();
  const results = createMemo(() =>
    section
      .items()
      .filter(
        (event) =>
          listsUnderWarning(event) &&
          !mutes?.hides(event) &&
          (!hasSearchExclusions(query()) ||
            passesSearchExclusions(query(), event, isBot)),
      ),
  );

  return (
    <SearchPanelView
      text={text()}
      onChange={setText}
      results={results()}
      status={section.status()}
      paging={section.paging()}
      onMore={section.loadMore}
      pending={text().trim() !== searched()}
      empty={empty()}
      onOpen={() => {
        const column = buildColumn("search", text().trim());
        if (column) dispatch({ type: "deck/add-column", column });
      }}
    />
  );
};

/** 読み取り層を使わずに、入力中・取得中・結果・空を並べて確認するための View。 */
export const SearchPanelView: Component<{
  text: string;
  onChange: (text: string) => void;
  results: readonly NostrEvent[];
  status: SectionStatus;
  paging: Paging;
  onMore: () => void;
  pending: boolean;
  empty: boolean;
  onOpen: () => void;
}> = (props) => (
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto" data-scroll-container>
      <div class="px-3 pb-3">
        <SearchQueryEditor
          text={props.text}
          onChange={props.onChange}
          autofocus
        />
      </div>
      <Switch>
        <Match when={props.empty}>
          <p class="c-secondary px-3 py-4 text-caption">
            キーワードを入力すると、ここに結果が表示されます。
          </p>
        </Match>
        <Match when={props.pending}>
          <p class="c-secondary px-3 py-4 text-caption">検索中…</p>
        </Match>
        <Match when={props.results.length > 0}>
          <div class="border-primary border-t">
            <VirtualList
              items={props.results}
              itemKey={(event) => event.id}
              class="[&>*]:border-primary [&>*]:border-b"
            >
              {(event) => <Event event={event} size="normal" replyContext />}
            </VirtualList>
            {props.status.incomplete && (
              <p class="c-secondary px-3 py-2 text-caption">
                一部のリレーから結果を取得できませんでした。
              </p>
            )}
            <OlderLoader paging={props.paging} onReach={props.onMore} />
          </div>
        </Match>
        <Match when={props.status.phase === "settled"}>
          <p class="c-secondary px-3 py-4 text-caption">
            {props.status.incomplete
              ? "一部のリレーから結果を取得できませんでした。"
              : "まだ投稿がありません。"}
          </p>
        </Match>
        <Match when={true}>
          <p class="c-secondary px-3 py-4 text-caption">検索中…</p>
        </Match>
      </Switch>
    </div>
    <div class="shrink-0 border-primary border-t bg-primary px-3 py-3">
      <Button
        variant="primary"
        shape="rounded"
        block
        disabled={props.empty}
        onClick={props.onOpen}
      >
        この条件でカラムを開く
      </Button>
    </div>
  </div>
);

export default SearchPanel;
