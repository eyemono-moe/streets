import {
  NOSSKEY_IFRAME_URL,
  type NosskeyFrame,
} from "@streets/core/signer/nosskey/nosskey-client";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";

export type MountedNosskeyFrame = NosskeyFrame & { dispose(): void };

/**
 * nosskey.app の iframe を、同意や保存領域の許可を求めるときだけ見える覆いの中に
 * 置く。iframe はページを開いている間ずっと同じものを使う。作り直すと、
 * ブラウザが文書ごとに覚える保存領域の許可が消え、毎回許可を求められる。
 * 開閉の部品（Dialog）に入れないのは、閉じると中身ごと作り直すため。
 */
export const mountNosskeyFrame = (): MountedNosskeyFrame => {
  const url = new URL(NOSSKEY_IFRAME_URL);
  // embedded にすると、iframe の地が透けて、こちらの枠に馴染む。
  url.searchParams.set("embedded", "1");
  url.searchParams.set("theme", "auto");
  url.searchParams.set("lang", "ja");

  const iframe = document.createElement("iframe");
  iframe.src = url.href;
  iframe.title = "Nosskey の確認";
  iframe.setAttribute(
    "allow",
    "publickey-credentials-get; publickey-credentials-create",
  );
  iframe.className = "block h-full w-full border-0";

  const [visible, setVisible] = createSignal(false);
  const container = document.createElement("div");
  document.body.append(container);
  const unmount = render(
    () => (
      // 閉じるボタンは nosskey.app の画面の中にある。こちらにも置くと二重になる。
      // 外を押しても閉じられるようにして、閉じ方を失わせない（iframe の中の Esc は
      // こちらへ届かない）。
      <div
        role="presentation"
        hidden={!visible()}
        class="fixed inset-0 flex animate-fade-in items-center justify-center bg-ui-950/40 p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) setVisible(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nosskey の確認"
          class="motion-pop c-primary relative h-[min(560px,100%)] w-[min(420px,100%)] overflow-hidden rounded-3 bg-primary shadow-lg"
          ref={(el) => el.append(iframe)}
        />
      </div>
    ),
    container,
  );

  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    post(message, targetOrigin) {
      const target = iframe.contentWindow;
      if (!target) return false;
      target.postMessage(message, targetOrigin);
      return true;
    },
    listen(handler) {
      const listener = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        handler(event.data, event.origin);
      };
      window.addEventListener("message", listener);
      listeners.add(listener);
      return () => {
        window.removeEventListener("message", listener);
        listeners.delete(listener);
      };
    },
    setVisible,
    dispose() {
      for (const listener of listeners) {
        window.removeEventListener("message", listener);
      }
      listeners.clear();
      unmount();
      container.remove();
    },
  };
};
