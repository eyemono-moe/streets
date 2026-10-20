import { buildNappletColumn } from "@streets/core/deck/column-presets";
import { nappletDirectorySource } from "@streets/core/deck/column-sources";
import { nappletDirectory } from "@streets/core/napplet/directory";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import { type Component, createMemo, createSignal } from "solid-js";
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
 * 公開されている napplet を探す。一覧は開いたときに一度取り、言葉での絞り込みは
 * 手元で行う（打つたびにリレーへ聞かない）。
 */
const NappletList: Component<{ followees: () => readonly string[] }> = (
  props,
) => {
  const dispatch = useDispatch();
  const { store } = useReadLayer();
  const section = createBlockSection({
    source: nappletDirectorySource,
    name: "napplets",
    maxItems: 500,
  });
  const [query, setQuery] = createSignal("");
  const [compatibleOnly, setCompatibleOnly] = createSignal(false);
  const [shown, setShown] = createSignal(NAPPLET_LIST_PAGE);
  const followees = createMemo(() => new Set(props.followees()));
  const entries = createMemo(() =>
    nappletDirectory(section.items(), {
      query: query(),
      supported: SUPPORTED,
      compatibleOnly: compatibleOnly(),
      followees: followees(),
    }),
  );
  const iconFor = createNappletIcons();
  return (
    <NappletListView
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
      onOpen={(manifest) =>
        dispatch({
          type: "stack/open",
          column: buildNappletColumn(
            manifest.pubkey,
            manifest.identifier ?? "",
            // 見つけたリレーを添える。作者の書き込み先に無くても、開いた先で引ける。
            relaysSeenOn(store, manifest.eventId),
          ),
        })
      }
    />
  );
};

export default NappletList;
