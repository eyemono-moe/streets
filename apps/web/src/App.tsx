import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { type Component, Show, lazy, onCleanup, onMount } from "solid-js";
import DeckScreen from "./deck/DeckScreen";
import { devRelayOverride } from "./dev-relay-override";
import { ReadLayerProvider } from "./read-layer";
import { screenshotMode } from "./screenshot-mode";
import { createSession } from "./session";
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
  const readLayer = createReadLayer({
    // session は pool を使うので後から作る。署名器は認証のときに読むので、それまでに決まっていればよい。
    connect: (url) => connectRelay(url, { signer: () => session.signer }),
    persistence: createIndexedDbPersistence(),
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
  onMount(session.restore);

  return (
    <>
      {/*
        ログインしていなくても同じデッキを開く（紹介とログインのカラムを先頭に置く）。
        ログインしたらその人のデッキで作り直す。
      */}
      <Show when={session.state() !== "loading"}>
        <Show when={session.pubkey() ?? GUEST} keyed>
          <ReadLayerProvider value={readLayer}>
            <DeckScreen
              readLayer={readLayer}
              session={session}
              bootstrapIndexers={relayOverride}
            />
          </ReadLayerProvider>
        </Show>
      </Show>
      <ErrorToaster />
      <SignerWaitNotice
        messages={session.signerWaits()}
        authUrl={session.authUrl()}
      />
      <Show when={import.meta.env.DEV && !screenshotMode()}>
        <AppDevtools readLayer={readLayer} />
      </Show>
    </>
  );
};

export default App;
