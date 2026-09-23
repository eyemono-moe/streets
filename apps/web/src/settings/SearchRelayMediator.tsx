import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  SEARCH_RELAY_LIST_KIND,
  effectiveSearchRelays,
  setSearchRelays,
} from "@streets/core/settings/search-relay-list";
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

export type SearchRelays = {
  relays: Accessor<readonly RelayUrl[]>;
  /** 自分で選んだ一覧か（false なら既定をそのまま使っている）。 */
  chosen: Accessor<boolean>;
  /** 保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const SearchRelaysContext = createContext<SearchRelays>();

/**
 * 検索を投げるリレー（kind:10007）を裁定する段。画像のアップロード先と同じく、
 * 足す・外すはその場で保存する。
 */
export const SearchRelayMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  relayList: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  const saved = createMemo(() => effectiveSearchRelays(props.relayList()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<readonly RelayUrl[]>();
  const relays = () => pending() ?? saved();

  const save = (next: readonly RelayUrl[]) => {
    if (saving()) return;
    setSaving(true);
    setPending(next);
    props.writer
      .replace(SEARCH_RELAY_LIST_KIND, undefined, setSearchRelays(next))
      .then(
        () => notifySaved("検索するリレーを保存しました"),
        (cause) => {
          setPending(undefined);
          notifyError(cause, "検索するリレーを保存できませんでした");
        },
      )
      .finally(() => setSaving(false));
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "search-relays/add":
        if (relays().includes(event.url)) return true;
        save([...relays(), event.url]);
        return true;
      case "search-relays/remove":
        save(relays().filter((relay) => relay !== event.url));
        return true;
      default:
        return false;
    }
  };

  return (
    <SearchRelaysContext.Provider
      value={{
        relays,
        saving,
        chosen: () =>
          pending() !== undefined || props.relayList() !== undefined,
      }}
    >
      <Mediates handle={handle}>{props.children}</Mediates>
    </SearchRelaysContext.Provider>
  );
};

export const useSearchRelays = (): SearchRelays | undefined =>
  useContext(SearchRelaysContext);
