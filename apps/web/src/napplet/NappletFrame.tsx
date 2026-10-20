import {
  type NappletHost,
  type NappletSession,
  createNappletSession,
} from "@streets/core/napplet/session";
import { type Component, createEffect, on, onCleanup, onMount } from "solid-js";
import { watchNappletTheme } from "./theme-colors";

/**
 * 照合済みの napplet を、origin を持たない iframe で動かす。`html` は CSP と
 * `window.napplet` を差し込んだ後のもの（`prepareNappletSrcdoc`）。
 *
 * `allow-same-origin` を付けない。付けると napplet が Streets と同じ origin になり、
 * Streets の localStorage や IndexedDB（NIP-46 の通信用の鍵がある）を読める。
 */
const NappletFrame: Component<{
  html: string;
  title: string;
  host: NappletHost;
  /** ログインしている人。変わったら napplet に知らせる。 */
  viewer: string;
  /** 動き始めた napplet とのやりとり。依頼を届けるのに使う。 */
  onSession?: (session: NappletSession | undefined) => void;
}> = (props) => {
  let frame!: HTMLIFrameElement;

  onMount(() => {
    // ピクチャーインピクチャーへ出したカラムでは、描いている窓が元のタブと違う。
    const view = frame.ownerDocument.defaultView;
    if (!view) return;
    const session = createNappletSession(props.host, (message) =>
      frame.contentWindow?.postMessage(message, "*"),
    );
    // NIP-5D: 送り主は `MessageEvent.source` で見分ける。origin は opaque（"null"）で使えない。
    const receive = (event: MessageEvent) => {
      if (event.source === null || event.source !== frame.contentWindow) return;
      session.receive(event.data);
    };
    view.addEventListener("message", receive);
    props.onSession?.(session);
    const stopTheme = watchNappletTheme(frame, () => session.themeChanged());
    createEffect(
      on(
        () => props.viewer,
        () => session.identityChanged(),
        { defer: true },
      ),
    );
    onCleanup(() => {
      props.onSession?.(undefined);
      view.removeEventListener("message", receive);
      stopTheme();
      session.dispose();
    });
  });

  return (
    <iframe
      ref={frame}
      title={props.title}
      srcdoc={props.html}
      // `allow-forms` が無いと、ブラウザはフォームの送信を submit イベントより前に止める。
      // napplet の多くは入力欄を form で書くので、Enter もボタンも効かなくなる。送信先への
      // 移動は、差し込んだ CSP の `form-action 'none'` が止める。
      sandbox="allow-scripts allow-forms"
      // カメラ・位置などのブラウザの機能は、NAP を通さずに使わせない。
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
      referrerpolicy="no-referrer"
      class="block h-full w-full border-0 bg-transparent"
    />
  );
};

export default NappletFrame;
