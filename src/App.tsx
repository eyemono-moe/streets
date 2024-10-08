import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import type { Component } from "solid-js";
import { EventCacheProvider } from "./context/eventCache";
import { RelaysProvider } from "./context/relays";
import { RxNostrDevtools, RxNostrProvider } from "./context/rxNostr";
import { RxQueryProvider } from "./context/rxQuery";
import { Toaster } from "./libs/toast";
import routes from "./router";

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
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <EventCacheProvider>
          <RelaysProvider>
            <RxNostrProvider>
              <RxQueryProvider>
                <Router>{routes}</Router>
              </RxQueryProvider>
              <RxNostrDevtools />
            </RxNostrProvider>
            <SolidQueryDevtools />
          </RelaysProvider>
        </EventCacheProvider>
      </QueryClientProvider>
      <Toaster />
    </>
  );
};

export default App;
