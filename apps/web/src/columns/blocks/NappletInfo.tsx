import { isInstalled } from "@streets/core/napplet/library";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import { type Component } from "solid-js";
import { useAppletLibrary } from "../../napplet/applet-library";
import { createNappletIcons } from "../../napplet/napplet-icons";
import NappletInfoView from "../../napplet/NappletInfoView";
import { STREETS_NAPPLET_DOMAINS } from "../../napplet/streets-host";
import { useReadLayer } from "../../read-layer";
import { useDispatch } from "../../ui-events";
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
  const dispatch = useDispatch();
  const library = useAppletLibrary();
  const { store } = useReadLayer();
  const applet = () => ({ pubkey: props.pubkey, identifier: props.identifier });
  return (
    <NappletInfoView
      lookup={lookup()}
      iconUrl={(() => {
        const current = manifest();
        return current ? iconFor(current) : undefined;
      })()}
      supported={SUPPORTED}
      installed={(() => {
        const current = library();
        return current ? isInstalled(current, applet()) : undefined;
      })()}
      onInstall={(addToDeck) => {
        const current = manifest();
        dispatch({
          type: "applets/install",
          applet: applet(),
          relays: [
            ...new Set([
              ...(props.relays ?? []),
              ...(current ? relaysSeenOn(store, current.eventId) : []),
            ]),
          ],
          addToDeck,
        });
      }}
      onUninstall={() =>
        dispatch({ type: "applets/uninstall", applet: applet() })
      }
    />
  );
};

export default NappletInfo;
