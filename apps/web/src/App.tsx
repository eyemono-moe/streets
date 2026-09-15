import { createIndexedDbPersistence } from "@streets/core/read/indexeddb-persistence";
import { createReadLayer } from "@streets/core/read/read-layer";
import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { type Component, Show, lazy, onCleanup } from "solid-js";

const AppDevtools = lazy(() => import("./devtools/AppDevtools"));

const App: Component = () => {
  const readLayer = createReadLayer({
    connect: connectRelay,
    persistence: createIndexedDbPersistence(),
  });
  onCleanup(() => readLayer.dispose());

  return (
    <>
      <main class="grid h-dvh place-items-center">
        <h1 class="font-bold text-2xl">Streets</h1>
      </main>
      <Show when={import.meta.env.DEV}>
        <AppDevtools readLayer={readLayer} />
      </Show>
    </>
  );
};

export default App;
