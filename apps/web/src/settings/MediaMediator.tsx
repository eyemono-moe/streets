import {
  BLOSSOM_SERVER_LIST_KIND,
  type BlossomServer,
  effectiveBlossomServers,
  setBlossomServers,
} from "@streets/core/media/blossom";
import type { NostrEvent } from "@streets/core/nostr/event";
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

export type MediaServers = {
  servers: Accessor<readonly BlossomServer[]>;
  /** 自分で選んだ一覧か（false なら既定をそのまま使っている）。 */
  chosen: Accessor<boolean>;
  /** 保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const MediaServersContext = createContext<MediaServers>();

/**
 * 画像の預け先（kind:10063）を裁定する段。足す・外すはその場で保存する ——
 * リレーやミュートと違って続けて変えることが少ないので、まとめる待ちは置かない。
 */
export const MediaMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  serverList: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  const saved = createMemo(() => effectiveBlossomServers(props.serverList()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<readonly BlossomServer[]>();
  const servers = () => pending() ?? saved();

  const save = (next: readonly BlossomServer[]) => {
    if (saving()) return;
    setSaving(true);
    setPending(next);
    props.writer
      .replace(BLOSSOM_SERVER_LIST_KIND, undefined, setBlossomServers(next))
      .then(
        () => notifySaved("画像の預け先を保存しました"),
        (cause) => {
          setPending(undefined);
          notifyError(cause, "画像の預け先を保存できませんでした");
        },
      )
      .finally(() => setSaving(false));
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "media/add-server":
        if (servers().includes(event.url)) return true;
        save([...servers(), event.url]);
        return true;
      case "media/remove-server":
        save(servers().filter((server) => server !== event.url));
        return true;
      default:
        return false;
    }
  };

  return (
    <MediaServersContext.Provider
      value={{
        servers,
        saving,
        chosen: () =>
          pending() !== undefined || props.serverList() !== undefined,
      }}
    >
      <Mediates handle={handle}>{props.children}</Mediates>
    </MediaServersContext.Provider>
  );
};

export const useMediaServers = (): MediaServers | undefined =>
  useContext(MediaServersContext);
