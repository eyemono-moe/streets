import { QueryClient } from "@tanstack/solid-query";

export const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 24 * 60 * 60 * 1000,
        gcTime: 7 * 24 * 60 * 60 * 1000,
        retry: 1,
      },
    },
  });
