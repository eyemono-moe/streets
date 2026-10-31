import {
  buildNappletColumn,
  buildNappletInfoColumn,
} from "@streets/core/deck/column-presets";
import {
  installedAppletsSource,
  nappletDirectorySource,
} from "@streets/core/deck/column-sources";
import {
  installedDirectory,
  nappletDirectory,
} from "@streets/core/napplet/directory";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import { type Component, createMemo, createSignal } from "solid-js";
import { useAppletLibrary } from "../../napplet/applet-library";
import { createNappletIcons } from "../../napplet/napplet-icons";
import NappletListView, {
  NAPPLET_LIST_PAGE,
} from "../../napplet/NappletListView";
import { STREETS_NAPPLET_DOMAINS } from "../../napplet/streets-host";
import { useReadLayer } from "../../read-layer";
import { useDispatch } from "../../ui-events";
import { createBlockSection } from "../column-scope";

const SUPPORTED: ReadonlySet<string> = new Set(STREETS_NAPPLET_DOMAINS);

/**
 * インストール済みのアップレットと、公開されているアップレットを探す一覧。探す一覧は
 * 開いたときに一度取り、言葉での絞り込みは手元で行う（打つたびにリレーへ聞かない）。
 */
const NappletList: Component<{ followees: () => readonly string[] }> = (
  props,
) => {
  const dispatch = useDispatch();
  const library = useAppletLibrary();
  const { store } = useReadLayer();
  const installedApplets = () => library()?.installed ?? [];
  // 入れた・外したたびに張り直さないよう、住所の組が変わったときだけ作り直す。
  const installedKey = createMemo(() =>
    installedApplets()
      .map((applet) => `${applet.pubkey}:${applet.identifier}`)
      .sort()
      .join(),
  );
  const installedSection = createBlockSection({
    source: () => {
      installedKey();
      return installedAppletsSource(installedApplets());
    },
    name: "installed",
  });
  const section = createBlockSection({
    source: nappletDirectorySource,
    name: "napplets",
    maxItems: 500,
  });
  const [query, setQuery] = createSignal("");
  const [compatibleOnly, setCompatibleOnly] = createSignal(false);
  const [shown, setShown] = createSignal(NAPPLET_LIST_PAGE);
  const followees = createMemo(() => new Set(props.followees()));
  const installed = createMemo(() =>
    installedDirectory(
      [...installedSection.items(), ...section.items()],
      installedApplets(),
      { supported: SUPPORTED, followees: followees() },
    ),
  );
  const entries = createMemo(() =>
    nappletDirectory(section.items(), {
      query: query(),
      supported: SUPPORTED,
      compatibleOnly: compatibleOnly(),
      followees: followees(),
      installed: installedApplets(),
    }),
  );
  const iconFor = createNappletIcons();
  // 見つけたリレーを添える。作者の書き込み先に無くても、開いた先で引ける。
  const seenOn = (manifest: NappletManifest) =>
    relaysSeenOn(store, manifest.eventId);
  const address = (manifest: NappletManifest) => ({
    pubkey: manifest.pubkey,
    identifier: manifest.identifier ?? "",
  });
  return (
    <NappletListView
      installed={installed()}
      installedSettled={installedSection.status().phase === "settled"}
      entries={entries()}
      settled={section.status().phase === "settled"}
      query={query()}
      onQuery={(next) => {
        setQuery(next);
        setShown(NAPPLET_LIST_PAGE);
      }}
      compatibleOnly={compatibleOnly()}
      onCompatibleOnly={setCompatibleOnly}
      shown={shown()}
      onShowMore={() => setShown((count) => count + NAPPLET_LIST_PAGE)}
      iconFor={iconFor}
      onOpen={(applet) =>
        dispatch({
          type: "stack/open",
          column: buildNappletColumn(
            applet.pubkey,
            applet.identifier,
            applet.relays,
          ),
        })
      }
      onInfo={(manifest) =>
        dispatch({
          type: "stack/open",
          column: buildNappletInfoColumn(
            manifest.pubkey,
            manifest.identifier ?? "",
            seenOn(manifest),
          ),
        })
      }
      onInstall={(manifest, addToDeck) =>
        dispatch({
          type: "applets/install",
          applet: address(manifest),
          relays: seenOn(manifest),
          addToDeck,
        })
      }
      onAddToDeck={(applet) =>
        dispatch({
          type: "deck/add-column",
          column: buildNappletColumn(
            applet.pubkey,
            applet.identifier,
            applet.relays,
          ),
        })
      }
      onUninstall={(applet) => dispatch({ type: "applets/uninstall", applet })}
    />
  );
};

export default NappletList;
