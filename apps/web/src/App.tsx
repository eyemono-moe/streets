import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import {
  type Component,
  Match,
  Show,
  Switch,
  lazy,
  onCleanup,
  onMount,
} from "solid-js";
import DeckScreen from "./deck/DeckScreen";
import { devRelayOverride } from "./dev-relay-override";
import { lazyPart } from "./lazy-part";
import { ReadLayerProvider } from "./read-layer";
import { screenshotMode } from "./screenshot-mode";
import { createSession } from "./session";
import SignerWaitOverlay from "./SignerWaitOverlay";
import { ErrorToaster } from "./toast";

const AppDevtools = lazy(() => import("./devtools/AppDevtools"));
// ログインしている人（ほとんどの起動）には要らない。
const WelcomeScreen = lazyPart(() => import("./welcome/WelcomeScreen"));

const App: Component = () => {
  const relayOverride = devRelayOverride(window.location.search);
  const readLayer = createReadLayer({
    connect: connectRelay,
    persistence: createIndexedDbPersistence(),
    fallbackRelays: relayOverride,
  });
  onCleanup(() => readLayer.dispose());

  const session = createSession(readLayer.manager.pool);
  onMount(session.restore);

  return (
    <>
      <Switch>
        <Match when={session.state() === "signed-out"}>
          <WelcomeScreen session={session} readLayer={readLayer} />
        </Match>
        <Match when={session.state() === "signed-in"}>
          <Show when={session.pubkey()} keyed>
            <ReadLayerProvider value={readLayer}>
              <DeckScreen
                readLayer={readLayer}
                session={session}
                bootstrapIndexers={relayOverride}
              />
            </ReadLayerProvider>
          </Show>
        </Match>
      </Switch>
      <ErrorToaster />
      <SignerWaitOverlay
        message={session.signerWait()}
        authUrl={session.authUrl()}
      />
      <Show when={import.meta.env.DEV && !screenshotMode()}>
        <AppDevtools readLayer={readLayer} />
      </Show>
    </>
  );
};

export default App;
