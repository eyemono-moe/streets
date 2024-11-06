import { createQuery } from "@tanstack/solid-query";
import { readServerConfig } from "nostr-tools/nip96";

export const useQueryServerConfig = (apiUrl: () => string) =>
  createQuery(() => ({
    queryKey: ["serverConfig", apiUrl()],
    queryFn: () => {
      return readServerConfig(apiUrl());
    },
  }));
