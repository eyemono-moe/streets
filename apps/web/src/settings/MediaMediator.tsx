import {
  BLOSSOM_SERVER_LIST_KIND,
  type BlossomServer,
  DEFAULT_BLOSSOM_SERVERS,
  NotBlossomServerError,
  checkBlossomServer,
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
import { notifyError, notifySaved, notifyWarning } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

export type MediaServers = {
  servers: Accessor<readonly BlossomServer[]>;
  /** 自分で選んだ一覧か（false なら既定をそのまま使っている）。 */
  chosen: Accessor<boolean>;
  /** 足す先を確かめているか、保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const MediaServersContext = createContext<MediaServers>();

/**
 * 画像のアップロード先（kind:10063）を裁定する段。足す・外すはその場で保存する ——
 * リレーやミュートと違って続けて変えることが少ないので、まとめる待ちは置かない。
 * 足す前に、Blossom として応答するかを 1 度だけ確かめる。
 */
export const MediaMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  serverList: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const busy = () => saving() || checking();
  const saved = createMemo(() => effectiveBlossomServers(props.serverList()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pending, setPending] = createSignal<readonly BlossomServer[]>();
  const servers = () => pending() ?? saved();

  const save = (next: readonly BlossomServer[]) => {
    setSaving(true);
    setPending(next);
    props.writer
      .replace(BLOSSOM_SERVER_LIST_KIND, undefined, setBlossomServers(next))
      .then(
        () => notifySaved("画像のアップロード先を保存しました"),
        (cause) => {
          setPending(undefined);
          notifyError(cause, "画像のアップロード先を保存できませんでした");
        },
      )
      .finally(() => setSaving(false));
  };

  const add = async (url: BlossomServer) => {
    setChecking(true);
    // おすすめは確かめてから載せている。blossom.primal.net はエラーの応答をブラウザに
    // 読ませないので、確かめると毎回「確かめられなかった」と出てしまう。
    const check = DEFAULT_BLOSSOM_SERVERS.includes(url)
      ? "blossom"
      : await checkBlossomServer({ server: url });
    setChecking(false);
    if (check === "nip96" || check === "not-blossom") {
      notifyError(
        new NotBlossomServerError(url, check === "nip96"),
        "アップロード先に足しませんでした",
      );
      return;
    }
    if (check === "unknown") {
      notifyWarning(
        "アップロード先を確かめられませんでした",
        `${url.replace(/^https:\/\//, "")} から応答を読み取れませんでした。一覧には足しましたが、画像をアップロードできない場合があります`,
      );
    }
    save([...servers(), url]);
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "media/add-server":
        if (busy() || servers().includes(event.url)) return true;
        void add(event.url);
        return true;
      case "media/remove-server":
        if (busy()) return true;
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
        saving: busy,
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
