import { type Component, Show, createSignal } from "solid-js";
import { t } from "../i18n/locale";
import type { ConnectAttempt } from "../session";
import SegmentedControl from "../ui/SegmentedControl";
import BunkerForm from "./BunkerForm";
import NostrConnectLogin from "./NostrConnectLogin";

/** リモート署名器との繋ぎ方を選ぶ。QR を出している間だけ署名器を待つ。 */
const RemoteSignerLogin: Component<{
  pending: boolean;
  onBunker: (uri: string) => void;
  onNostrConnect: () => ConnectAttempt;
  initialBunkerUri?: string;
}> = (props) => {
  const [way, setWay] = createSignal<"qr" | "paste">(
    props.initialBunkerUri ? "paste" : "qr",
  );
  return (
    <div class="flex flex-col gap-3">
      <SegmentedControl
        label={t("welcome.remote.wayLabel")}
        variant="secondary"
        block
        value={way()}
        onChange={setWay}
        options={[
          {
            value: "qr",
            label: t("welcome.remote.qr"),
            icon: "i-material-symbols:qr-code-2-rounded",
          },
          {
            value: "paste",
            label: t("welcome.remote.paste"),
            icon: "i-material-symbols:link-rounded",
          },
        ]}
      />
      <Show
        when={way() === "paste"}
        fallback={<NostrConnectLogin start={props.onNostrConnect} />}
      >
        <BunkerForm
          pending={props.pending}
          onBunker={props.onBunker}
          initialValue={props.initialBunkerUri}
        />
      </Show>
    </div>
  );
};

export default RemoteSignerLogin;
