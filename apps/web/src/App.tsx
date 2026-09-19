import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { type Component, Show, lazy, onCleanup, onMount } from "solid-js";
import LoginScreen from "./LoginScreen";
import DeckScreen from "./deck/DeckScreen";
import { devRelayOverride } from "./dev-relay-override";
import { ReadLayerProvider } from "./read-layer";
import { createSession } from "./session";
import { ErrorToaster } from "./toast";

const AppDevtools = lazy(() => import("./devtools/AppDevtools"));

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
      <Show
        when={session.pubkey()}
        fallback={<LoginScreen session={session} />}
        keyed
      >
        <ReadLayerProvider value={readLayer}>
          <DeckScreen
            readLayer={readLayer}
            session={session}
            bootstrapIndexers={relayOverride}
          />
        </ReadLayerProvider>
      </Show>
      <ErrorToaster />
      <Show when={import.meta.env.DEV}>
        <AppDevtools readLayer={readLayer} />
      </Show>
    </>
  );
};

export default App;
