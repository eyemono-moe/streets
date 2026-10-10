import {
  BLOSSOM_SERVER_LIST_KIND,
  type BlossomServer,
  DEFAULT_BLOSSOM_SERVERS,
  effectiveBlossomServers,
  setBlossomServers,
} from "@streets/core/media/blossom";
import {
  NIP96_SERVER_LIST_KIND,
  parseNip96Servers,
  setNip96Servers,
} from "@streets/core/media/nip96";
import {
  NotUploadServerError,
  type UploadServer,
  checkUploadServer,
  uploadServers,
} from "@streets/core/media/upload-servers";
import type { Mutation } from "@streets/core/nostr/build/draft";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  type Setter,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import { notifyError, notifySaved, notifyWarning } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

export type MediaServers = {
  servers: Accessor<readonly UploadServer[]>;
  /** 自分で選んだ一覧か（false なら既定をそのまま使っている）。 */
  chosen: Accessor<boolean>;
  /** 足す先を確かめているか、保存している途中。続けて押させない。 */
  saving: Accessor<boolean>;
};

const MediaServersContext = createContext<MediaServers>();

const hostOf = (url: BlossomServer) => url.replace(/^https:\/\//, "");

/**
 * 画像のアップロード先（Blossom は kind:10063、NIP-96 は kind:10096）を裁定する段。
 * 足す・外すはその場で保存する —— リレーやミュートと違って続けて変えることが少ないので、
 * まとめる待ちは置かない。足す前に、どちらの方式で応答するかを 1 度だけ確かめる。
 */
export const MediaMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  blossomList: Accessor<NostrEvent | undefined>;
  nip96List: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [saving, setSaving] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const busy = () => saving() || checking();
  const savedBlossom = createMemo(() =>
    effectiveBlossomServers(props.blossomList()),
  );
  const savedNip96 = createMemo(() => parseNip96Servers(props.nip96List()));
  // 保存が届くまでの間も、足した・外した結果を見せる。
  const [pendingBlossom, setPendingBlossom] =
    createSignal<readonly BlossomServer[]>();
  const [pendingNip96, setPendingNip96] =
    createSignal<readonly BlossomServer[]>();
  const blossom = () => pendingBlossom() ?? savedBlossom();
  const nip96 = () => pendingNip96() ?? savedNip96();
  const servers = createMemo(() => uploadServers(blossom(), nip96()));

  const save = (
    kind: number,
    next: readonly BlossomServer[],
    mutation: (servers: readonly BlossomServer[]) => Mutation,
    setPending: Setter<readonly BlossomServer[] | undefined>,
  ) => {
    setSaving(true);
    setPending(next);
    props.writer
      .replace(kind, undefined, mutation(next))
      .then(
        () => notifySaved("画像のアップロード先を保存しました"),
        (cause) => {
          setPending(undefined);
          notifyError(cause, "画像のアップロード先を保存できませんでした");
        },
      )
      .finally(() => setSaving(false));
  };
  const saveBlossom = (next: readonly BlossomServer[]) =>
    save(BLOSSOM_SERVER_LIST_KIND, next, setBlossomServers, setPendingBlossom);
  const saveNip96 = (next: readonly BlossomServer[]) =>
    save(NIP96_SERVER_LIST_KIND, next, setNip96Servers, setPendingNip96);

  const add = async (url: BlossomServer) => {
    setChecking(true);
    // おすすめは確かめてから載せている。blossom.primal.net はエラーの応答をブラウザに
    // 読ませないので、確かめると毎回「確かめられなかった」と出てしまう。
    const check = DEFAULT_BLOSSOM_SERVERS.includes(url)
      ? "blossom"
      : await checkUploadServer({ server: url });
    setChecking(false);
    switch (check) {
      case "not-blossom":
        notifyError(
          new NotUploadServerError(url),
          "アップロード先に足しませんでした",
        );
        return;
      case "nip96":
        notifyWarning(
          "アップロード先に追加しました",
          `${hostOf(url)} は古い方式（NIP-96）のアップロード先です。将来的にこのアップロード先は使用できなくなる可能性があります`,
        );
        saveNip96([...nip96(), url]);
        return;
      case "unknown":
        notifyWarning(
          "アップロード先に追加しました",
          `${hostOf(url)} から応答を読み取れませんでした。画像のアップロードに失敗する可能性があります`,
        );
        saveBlossom([...blossom(), url]);
        return;
      case "blossom":
        saveBlossom([...blossom(), url]);
        return;
    }
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "media/add-server":
        if (busy() || servers().some((server) => server.url === event.url)) {
          return true;
        }
        void add(event.url);
        return true;
      case "media/remove-server":
        if (busy()) return true;
        if (blossom().includes(event.url)) {
          saveBlossom(blossom().filter((url) => url !== event.url));
        } else if (nip96().includes(event.url)) {
          saveNip96(nip96().filter((url) => url !== event.url));
        }
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
          pendingBlossom() !== undefined || props.blossomList() !== undefined,
      }}
    >
      <Mediates handle={handle}>{props.children}</Mediates>
    </MediaServersContext.Provider>
  );
};

export const useMediaServers = (): MediaServers | undefined =>
  useContext(MediaServersContext);
