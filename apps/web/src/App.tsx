import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { createRelayTraffic } from "@streets/core/relay/relay-traffic";
import { createSubscriptionLimits } from "@streets/core/relay/subscription-limits";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { type Component, Show, lazy, onCleanup, onMount } from "solid-js";
import DeckScreen from "./deck/DeckScreen";
import { devRelayOverride } from "./dev-relay-override";
import { ReadLayerProvider } from "./read-layer";
import { screenshotMode } from "./screenshot-mode";
import { createSession } from "./session";
import SignerDisconnectedNotice from "./SignerDisconnectedNotice";
import SignerWaitNotice from "./SignerWaitNotice";
import { ErrorToaster } from "./toast";

const AppDevtools = lazy(() => import("./devtools/AppDevtools"));
/** ログインしていない人のデッキを作り直す鍵。pubkey とは重ならない。 */
const GUEST = "guest";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** 短いタブの切り替えでは接続を揺らさない。 */
const BACKGROUND_PAUSE_MS = 5 * 60_000;

const App: Component = () => {
  const relayOverride = devRelayOverride(window.location.search);
  // メッセージごとに大きさを数えるので、Devtools を出す開発時だけ測る。
  const relayTraffic = import.meta.env.DEV ? createRelayTraffic() : undefined;
  const readLayer = createReadLayer({
    // session は pool を使うので後から作る。署名器は認証のときに読むので、それまでに決まっていればよい。
    connect: (url) =>
      connectRelay(url, {
        signer: () => session.signer,
        traffic: relayTraffic?.recorder,
      }),
    persistence: createIndexedDbPersistence(),
    // 上限を超える REQ を、リレーは黙って捨てる。NIP-11 の値を超えないよう順番待ちにする。
    maxSubscriptions: createSubscriptionLimits(),
    onQueued: relayTraffic?.recorder.queued,
    fallbackRelays: relayOverride,
    // 手元で開いたページからなら、ブラウザは手元のリレーへの接続に許可を求めない。
    allowLocalNetwork:
      import.meta.env.DEV || LOOPBACK_HOSTS.has(window.location.hostname),
  });
  onCleanup(() => readLayer.dispose());

  onMount(() => {
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibilityChange = () => {
      if (pauseTimer !== undefined) clearTimeout(pauseTimer);
      pauseTimer = undefined;
      if (document.hidden) {
        pauseTimer = setTimeout(() => {
          pauseTimer = undefined;
          if (document.hidden) readLayer.manager.pause();
        }, BACKGROUND_PAUSE_MS);
      } else {
        readLayer.manager.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    });
  });

  const session = createSession(readLayer.manager.pool, {
    nostrConnectRelays: relayOverride,
  });
  // デッキを作る前に覚えていた人を当て、ゲストのデッキを一度作ってから作り直さない。
  session.restore();

  return (
    <>
      {/*
        ログインしていなくても同じデッキを開く（紹介とログインのカラムを先頭に置く）。
        ログインしたらその人のデッキで作り直す。ログインを戻すのは待たない —— 覚えて
        いた人のデッキを先に出し、署名器が戻るまで書き込みだけを待たせる。
      */}
      <Show when={session.pubkey() ?? GUEST} keyed>
        <ReadLayerProvider value={readLayer}>
          <DeckScreen
            readLayer={readLayer}
            session={session}
            bootstrapIndexers={relayOverride}
          />
        </ReadLayerProvider>
      </Show>
      <ErrorToaster />
      <SignerWaitNotice
        messages={session.signerWaits()}
        authUrl={session.authUrl()}
      />
      <SignerDisconnectedNotice
        disconnected={
          session.signerStatus() === "disconnected" && !session.pending()
        }
        message={session.error()}
        onRetry={session.restore}
      />
      <Show when={import.meta.env.DEV && !screenshotMode()}>
        <AppDevtools readLayer={readLayer} relayTraffic={relayTraffic} />
      </Show>
    </>
  );
};

export default App;
