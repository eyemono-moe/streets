import { usePrefersDark } from "@solid-primitives/media";
import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { type Component, type ParentComponent, createEffect } from "solid-js";
import { EventCacheProvider } from "./context/eventCache";
import { FileServerProvider } from "./context/fileServer";
import { LoadingProvider } from "./context/loading";
import { MeProvider } from "./context/me";
import { MuteProvider } from "./context/mute";
import { RelaysProvider } from "./context/relays";
import { RxNostrProvider, useRxNostr } from "./context/rxNostr";
import { NostrCoreProvider } from "./core/solid/provider";
import { DeckProvider } from "./features/Column/context/deck";
import { PostInputProvider } from "./features/CreatePost/context/postInputDialog";
import routes from "./router";
import { Toaster } from "./shared/libs/toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      gcTime: 1000 * 60 * 60, // 1 hour
      retry: false,
    },
  },
});

const AppNostrProviders: ParentComponent = (props) => {
  const { core } = useRxNostr();

  return <NostrCoreProvider core={core}>{props.children}</NostrCoreProvider>;
};

const App: Component = () => {
  const prefersDark = usePrefersDark();
  // Keep the document theme class in sync with the user's OS-level color scheme.
  createEffect(() => {
    document.documentElement.classList.toggle("dark", prefersDark());
  });

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <EventCacheProvider>
          <LoadingProvider>
            <MeProvider>
              <RelaysProvider>
                <FileServerProvider>
                  <RxNostrProvider>
                    <AppNostrProviders>
                      <MuteProvider>
                        <DeckProvider>
                          <PostInputProvider>
                            <Router>{routes}</Router>
                          </PostInputProvider>
                        </DeckProvider>
                      </MuteProvider>
                    </AppNostrProviders>
                  </RxNostrProvider>
                </FileServerProvider>
                <SolidQueryDevtools />
              </RelaysProvider>
            </MeProvider>
          </LoadingProvider>
        </EventCacheProvider>
      </QueryClientProvider>
      <Toaster />
    </>
  );
};

export default App;
