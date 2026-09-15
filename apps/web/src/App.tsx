import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { type Component, Show, lazy, onCleanup, onMount } from "solid-js";
import HomeTimeline from "./HomeTimeline";
import LoginScreen from "./LoginScreen";
import { createSession } from "./session";

const AppDevtools = lazy(() => import("./devtools/AppDevtools"));

const App: Component = () => {
  const readLayer = createReadLayer({
    connect: connectRelay,
    persistence: createIndexedDbPersistence(),
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
        <HomeTimeline readLayer={readLayer} session={session} />
      </Show>
      <Show when={import.meta.env.DEV}>
        <AppDevtools readLayer={readLayer} />
      </Show>
    </>
  );
};

export default App;
