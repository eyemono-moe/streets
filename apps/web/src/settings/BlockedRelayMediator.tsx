import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  BLOCKED_RELAY_LIST_KIND,
  parseBlockedRelays,
  setBlockedRelays,
} from "@streets/core/settings/blocked-relay-list";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

export type BlockedRelays = {
  relays: Accessor<readonly RelayUrl[]>;
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
  list: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  const saved = createMemo(() => parseBlockedRelays(props.list()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<readonly RelayUrl[]>();
  const relays = () => pending() ?? saved();

  const save = (next: readonly RelayUrl[]) => {
    if (saving()) return;
    setSaving(true);
    setPending(next);
    props.writer
      .replace(BLOCKED_RELAY_LIST_KIND, undefined, setBlockedRelays(next))
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
      case "blocked-relays/add":
        if (relays().includes(event.url)) return true;
        save([...relays(), event.url]);
        return true;
      case "blocked-relays/remove":
        save(relays().filter((relay) => relay !== event.url));
        return true;
      default:
        return false;
    }
  };

  return (
    <BlockedRelaysContext.Provider value={{ relays, saving }}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </BlockedRelaysContext.Provider>
  );
};

export const useBlockedRelays = (): BlockedRelays | undefined =>
  useContext(BlockedRelaysContext);
