import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { MAX_FALLBACK_RELAYS } from "@streets/core/settings/fallback-relay-setting";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, Show } from "solid-js";
import RelayColumnEditor from "../deck/RelayColumnEditor";
import { useDispatch } from "../ui-events";
import SettingsSection from "./SettingsSection";

const hostOf = (url: RelayUrl) => relayLabel(url).replace(/^wss?:\/\//, "");

/** 既定のリレー。変えたらイベントを上へ渡す。 */
const FallbackRelaysView: Component<{
  /** 自分で指定したリレー。空なら Streets が決めたリレーを使う。 */
  relays: readonly RelayUrl[];
  /** 足すときの候補に出す、自分のリレー。 */
  candidates: readonly RelayListEntry[];
  /** フォローしている人ごとの、書き込みに使うリレー。渡さなければ読み取り層から引く。 */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <SettingsSection
      id="fallbackRelays"
      scope="device"
      description={`リレーの設定が見つからない人の投稿を読むときや、あなたの書き込みリレーが無いときの送り先に使うリレーです。${MAX_FALLBACK_RELAYS} 本まで指定できます。1 本も指定しなければ、Streets が決めたリレーを使います。`}
    >
      <Show when={props.relays.length === 0}>
        <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
          {`いまは Streets が決めたリレー（${FALLBACK_RELAYS.map(hostOf).join("・")}）を使っています。`}
        </p>
      </Show>
      <RelayColumnEditor
        candidates={props.candidates}
        followeeWriteRelays={props.followeeWriteRelays}
        selected={props.relays}
        maximum={MAX_FALLBACK_RELAYS}
        listLabel="既定のリレー"
        onChange={(relays) =>
          dispatch({ type: "deck/set-fallback-relays", relays })
        }
      />
    </SettingsSection>
  );
};

export default FallbackRelaysView;
