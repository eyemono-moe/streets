import { type Component, createEffect, onCleanup } from "solid-js";
import type { SignerWaitToastMeta } from "./SignerWaitToast";
import { toaster } from "./toast";

/**
 * 署名器の承認待ちを 1 枚のトーストに出す。画面は止めない —— 二重送信はボタンと
 * actions-mediator が、同じリストへの続けての変更は Writer が順に並べて防ぐ。
 * 閉じられたら、待ちが一度すべて片付くまで出し直さない。承認のページを求められたときは、
 * 開かないと進まないので閉じられていても出す。
 */
const SignerWaitNotice: Component<{
  messages: readonly string[];
  authUrl?: URL;
}> = (props) => {
  let id: string | undefined;
  let dismissed = false;
  let shownAuthUrl: URL | undefined;

  const remove = () => {
    if (!id) return;
    const current = id;
    // 先に忘れ、onStatusChange が「閉じられた」と取り違えないようにする。
    id = undefined;
    toaster.remove(current);
  };

  createEffect(() => {
    const messages = props.messages;
    const authUrl = props.authUrl;
    if (messages.length === 0 && !authUrl) {
      dismissed = false;
      shownAuthUrl = undefined;
      remove();
      return;
    }
    if (authUrl && authUrl !== shownAuthUrl) dismissed = false;
    shownAuthUrl = authUrl;
    if (dismissed) return;
    const meta: SignerWaitToastMeta = { signerWait: { messages, authUrl } };
    if (id) {
      toaster.update(id, { meta });
      return;
    }
    const created = toaster.create({
      type: "loading",
      duration: Number.POSITIVE_INFINITY,
      meta,
      onStatusChange: (details) => {
        if (details.status !== "unmounted" || id !== created) return;
        id = undefined;
        dismissed = true;
      },
    });
    id = created;
  });

  onCleanup(remove);
  return null;
};

export default SignerWaitNotice;
