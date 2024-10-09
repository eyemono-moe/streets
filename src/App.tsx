import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import type { Component } from "solid-js";
import { EventCacheProvider } from "./context/eventCache";
import { RelaysProvider } from "./context/relays";
import { RxNostrProvider } from "./context/rxNostr";
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
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <EventCacheProvider>
          <RelaysProvider>
            <RxNostrProvider>
              <Router>{routes}</Router>
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
