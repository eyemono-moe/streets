import { buildNappletColumn } from "@streets/core/deck/column-presets";
import { grantsOf, isInstalled } from "@streets/core/napplet/library";
import { parseGrantKey } from "@streets/core/napplet/publish";
import { kindLabel } from "@streets/core/nostr/kind-support";
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
  const installedRelays = () =>
    library()?.installed.find(
      (item) =>
        item.pubkey === props.pubkey && item.identifier === props.identifier,
    )?.relays ?? [...(props.relays ?? [])];
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
      onOpen={() =>
        dispatch({
          type: "stack/open",
          column: buildNappletColumn(
            props.pubkey,
            props.identifier,
            installedRelays(),
          ),
        })
      }
      onAddToDeck={() =>
        dispatch({
          type: "deck/add-column",
          column: buildNappletColumn(
            props.pubkey,
            props.identifier,
            installedRelays(),
          ),
        })
      }
      grants={(() => {
        const current = library();
        if (!current) return [];
        return grantsOf(current, applet()).flatMap((key) => {
          const grant = parseGrantKey(key);
          if (!grant) return [];
          const label = kindLabel(grant.kind);
          const name = label === "イベント" ? `kind:${grant.kind}` : label;
          return [
            {
              key,
              label:
                grant.operation === "publishEncrypted"
                  ? `${name}（暗号化して送る）`
                  : name,
            },
          ];
        });
      })()}
      onRevoke={(key) =>
        dispatch({
          type: "applets/set-grant",
          applet: applet(),
          key,
          on: false,
        })
      }
      onUninstall={() =>
        dispatch({ type: "applets/uninstall", applet: applet() })
      }
    />
  );
};

export default NappletInfo;
