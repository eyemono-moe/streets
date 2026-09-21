import { type Component, Show } from "solid-js";
import { useSearchRelays } from "./SearchRelayMediator";
import SearchSettingsView from "./SearchSettingsView";

/** 検索するリレーのページ。一覧と保存は `SearchRelayMediator` が持つ。 */
const SearchSettings: Component = () => {
  const search = useSearchRelays();
  return (
    <Show when={search}>
      {(search) => (
        <SearchSettingsView
          relays={search().relays()}
          saving={search().saving()}
          chosen={search().chosen()}
        />
      )}
    </Show>
  );
};

export default SearchSettings;
