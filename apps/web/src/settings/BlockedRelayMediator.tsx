import type {
  ItemVisibility,
  PrivatePartStatus,
} from "@streets/core/nostr/private-tags";
import {
  BLOCKED_RELAY_LIST_KIND,
  type BlockedRelayChange,
  type BlockedRelayEntry,
  type DecodedBlockedRelayList,
  applyBlockedRelayChange,
  changeBlockedRelays,
} from "@streets/core/settings/blocked-relay-list";
import type { Signer } from "@streets/core/signer/signer";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createSignal,
  useContext,
} from "solid-js";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

export type BlockedRelays = {
  entries: Accessor<readonly BlockedRelayEntry[]>;
  /** 非公開の項目を読み書きできるか。復号が済むまでは undefined。 */
  privatePart: Accessor<PrivatePartStatus | undefined>;
  /** 保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const BlockedRelaysContext = createContext<BlockedRelays>();

/**
 * 繋がないリレー（kind:10006）を裁定する段。検索するリレーと同じく、足す・
 * 外すはその場で保存する。読み取り層へ当てるのは `applyBlockedRelays` で、
 * 保存した一覧がストアに入ればそちらが拾う。
 */
export const BlockedRelayMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  signer: Signer;
  viewer: string;
  list: Accessor<DecodedBlockedRelayList | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<readonly BlockedRelayEntry[]>();
  const entries = () => pending() ?? props.list()?.entries ?? [];
  const privatePart = () => props.list()?.privatePart;

  const save = (change: BlockedRelayChange) => {
    if (saving()) return;
    setSaving(true);
    setPending(applyBlockedRelayChange(entries(), change));
    props.writer
      .replace(
        BLOCKED_RELAY_LIST_KIND,
        undefined,
        changeBlockedRelays(props.signer, props.viewer, change),
      )
      .then(
        () => notifySaved("繋がないリレーを保存しました"),
        (cause) => notifyError(cause, "繋がないリレーを保存できませんでした"),
      )
      .finally(() => {
        setPending(undefined);
        setSaving(false);
      });
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "blocked-relays/add": {
        if (entries().some((entry) => entry.url === event.url)) return true;
        // 非公開を扱えないなら、選んでいても公開として足す。
        const visibility: ItemVisibility =
          privatePart() === "ready" ? event.visibility : "public";
        save({ type: "add", entry: { url: event.url, visibility } });
        return true;
      }
      case "blocked-relays/remove":
        save({ type: "remove", entry: event.entry });
        return true;
      default:
        return false;
    }
  };

  return (
    <BlockedRelaysContext.Provider value={{ entries, privatePart, saving }}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </BlockedRelaysContext.Provider>
  );
};

export const useBlockedRelays = (): BlockedRelays | undefined =>
  useContext(BlockedRelaysContext);
