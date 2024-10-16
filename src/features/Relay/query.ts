import { createQuery } from "@tanstack/solid-query";
import { fetchNip11 } from "./libs/nip11";

export const useQueryNip11 = (relay: () => string) =>
  createQuery(() => ({
    queryKey: ["relayDetail", relay()],
    queryFn: () => {
      return fetchNip11(relay());
    },
  }));
