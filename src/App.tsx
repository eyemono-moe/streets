import { usePrefersDark } from "@solid-primitives/media";
import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { type Component, createEffect } from "solid-js";
import { EventCacheProvider } from "./context/eventCache";
import { FileServerProvider } from "./context/fileServer";
import { MeProvider } from "./context/me";
import { MuteProvider } from "./context/mute";
import { RelaysProvider } from "./context/relays";
import { RxNostrProvider } from "./context/rxNostr";
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

const App: Component = () => {
  const prefersDark = usePrefersDark();
  createEffect(() => {
    document.documentElement.classList.toggle("dark", prefersDark());
  });

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <EventCacheProvider>
          <MeProvider>
            <RelaysProvider>
              <FileServerProvider>
                <RxNostrProvider>
                  <MuteProvider>
                    <DeckProvider>
                      <PostInputProvider>
                        <Router>{routes}</Router>
                      </PostInputProvider>
                    </DeckProvider>
                  </MuteProvider>
                </RxNostrProvider>
              </FileServerProvider>
              <SolidQueryDevtools />
            </RelaysProvider>
          </MeProvider>
        </EventCacheProvider>
      </QueryClientProvider>
      <Toaster />
    </>
  );
};

export default App;
