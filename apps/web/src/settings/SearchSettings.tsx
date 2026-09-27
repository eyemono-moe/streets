import { type Component, Show } from "solid-js";
import { useRelayEdit } from "./RelayMediator";
import { useSearchRelays } from "./SearchRelayMediator";
import SearchSettingsView from "./SearchSettingsView";

/** 検索するリレーのページ。一覧と保存は `SearchRelayMediator` が持つ。 */
const SearchSettings: Component = () => {
  const search = useSearchRelays();
  const relayEdit = useRelayEdit();
  return (
    <Show when={search}>
      {(search) => (
        <SearchSettingsView
          relays={search().relays()}
          saving={search().saving()}
          chosen={search().chosen()}
          account={relayEdit?.entries() ?? []}
        />
      )}
    </Show>
  );
};

export default SearchSettings;
