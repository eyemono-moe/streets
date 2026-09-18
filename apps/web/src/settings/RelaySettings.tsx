import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import { type Component, Show, createSignal, onCleanup } from "solid-js";
import { useRelayEdit } from "./RelayMediator";
import RelaySettingsView from "./RelaySettingsView";

/**
 * 接続の様子を見直す間隔。つながった・切れたの通知はプールに無いので、
 * このページを開いている間だけ見に行く。
 */
const STATUS_POLL_MS = 2000;

/** リレーの設定のページ。書きかけと保存は `RelayMediator` が持つ。 */
const RelaySettings: Component = () => {
  const edit = useRelayEdit();
  const [tick, setTick] = createSignal(0);
  const interval = setInterval(() => setTick((n) => n + 1), STATUS_POLL_MS);
  onCleanup(() => clearInterval(interval));

  return (
    <Show when={edit}>
      {(edit) => (
        <RelaySettingsView
          entries={edit().entries()}
          loading={edit().loading()}
          allows={edit().allows}
          statusOf={(url) => {
            tick();
            return edit().statusOf(url);
          }}
          fallback={FALLBACK_RELAYS}
          infoOf={edit().infoOf}
        />
      )}
    </Show>
  );
};

export default RelaySettings;
