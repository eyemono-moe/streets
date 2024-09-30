import { Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import type { Component } from "solid-js";
import { RelaysProvider } from "./context/relays";
import { SubscriberProvider } from "./context/subscriber";
import routes from "./router";

const queryClient = new QueryClient();

const App: Component = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <RelaysProvider>
        <SubscriberProvider>
          <Router>{routes}</Router>
        </SubscriberProvider>
        <SolidQueryDevtools />
      </RelaysProvider>
    </QueryClientProvider>
  );
};

export default App;
