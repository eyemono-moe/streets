import { sharedText } from "@streets/core/view/shared-text";
import { createSignal } from "solid-js";
import { notifyWarning } from "../toast";
import {
  SHARE_CACHE,
  SHARE_FAILED,
  SHARE_PARAM,
  shareInboxKey,
} from "./share-inbox-keys";

/** 共有で届いた、投稿欄に入れる中身。 */
export type SharedPost = {
  content: string;
  files: readonly File[];
};

// ログインを待つ間にデッキが作り直されるので、デッキの外に置く。
const [pendingShare, setPendingShare] = createSignal<SharedPost>();
export { pendingShare };

export const clearPendingShare = () => setPendingShare(undefined);

const RECEIVE_FAILED = "共有された内容を受け取れませんでした";
const notifyReceiveFailed = () =>
  notifyWarning(RECEIVE_FAILED, "もう一度、共有し直してください。");

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
};

const read = async (id: string): Promise<SharedPost | undefined> => {
  const cache = await caches.open(SHARE_CACHE);
  const key = shareInboxKey(id);
  const response = await cache.match(key);
  if (!response) return undefined;
  const form = await response.formData();
  await cache.delete(key);
  return {
    content: sharedText({
      title: text(form, "title"),
      text: text(form, "text"),
      url: text(form, "url"),
    }),
    // 何も選ばなかった欄も、空のファイルとして届くことがある。
    files: form
      .getAll("media")
      .filter((value): value is File => value instanceof File)
      .filter((file) => file.size > 0),
  };
};

/**
 * 共有の受け口（Service Worker）が置いた中身を取り出す。URL の引数は、再読み込みで
 * もう一度開かないように、読む前に消す。
 */
export const receiveShare = (): void => {
  if (!("caches" in window)) return;
  const url = new URL(window.location.href);
  const id = url.searchParams.get(SHARE_PARAM);
  if (id === null) {
    // 開かれずに残った共有を片付ける。
    void caches.delete(SHARE_CACHE).catch(() => {});
    return;
  }
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(window.history.state, "", url);
  if (id === SHARE_FAILED) {
    notifyReceiveFailed();
    return;
  }
  read(id).then((shared) => {
    if (!shared) {
      notifyReceiveFailed();
      return;
    }
    if (shared.content === "" && shared.files.length === 0) return;
    setPendingShare(shared);
  }, notifyReceiveFailed);
};

/** 共有の受け口を入れる。`/sw.js` はビルドでだけ作るので、開発サーバーでは入れない。 */
export const registerShareWorker = (): void => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register("/sw.js", { type: "module" })
    .catch(() => {});
};
