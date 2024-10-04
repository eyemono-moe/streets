import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import type { Component } from "solid-js";
import { RelaysProvider } from "./context/relays";
import { RxNostrDevtools, RxNostrProvider } from "./context/rxNostr";
import { RxQueryProvider } from "./context/rxQuery";
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
    <QueryClientProvider client={queryClient}>
      <RelaysProvider>
        <RxNostrProvider>
          <RxQueryProvider>
            <Router>{routes}</Router>
          </RxQueryProvider>
          <RxNostrDevtools />
        </RxNostrProvider>
        <SolidQueryDevtools />
      </RelaysProvider>
    </QueryClientProvider>
  );
};

export default App;
