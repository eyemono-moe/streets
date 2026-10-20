import { type Component } from "solid-js";
import { createNappletIcons } from "../../napplet/napplet-icons";
import NappletInfoView from "../../napplet/NappletInfoView";
import { STREETS_NAPPLET_DOMAINS } from "../../napplet/streets-host";
import { createNappletManifest } from "./napplet-manifest";

const SUPPORTED: ReadonlySet<string> = new Set(STREETS_NAPPLET_DOMAINS);

/** napplet の情報を読む。アイコンは作者のサーバーから取り、ハッシュを照合してから出す。 */
const NappletInfo: Component<{
  pubkey: string;
  identifier: string;
  relays?: readonly string[];
}> = (props) => {
  const { lookup, manifest } = createNappletManifest({
    pubkey: () => props.pubkey,
    identifier: () => props.identifier,
    relays: () => props.relays,
  });
  const iconFor = createNappletIcons();
  return (
    <NappletInfoView
      lookup={lookup()}
      iconUrl={(() => {
        const current = manifest();
        return current ? iconFor(current) : undefined;
      })()}
      supported={SUPPORTED}
    />
  );
};

export default NappletInfo;
