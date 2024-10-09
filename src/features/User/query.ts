import { createQuery } from "@tanstack/solid-query";
import { fetchNip05 } from "../../shared/libs/nip05";

export const useQueryNip05 = (
  nip05: () =>
    | {
        name: string;
        domain: string;
      }
    | undefined,
) => {
  return createQuery(() => ({
    queryKey: ["nip05", nip05()],
    queryFn: async () => {
      const _nip05 = nip05();
      if (!_nip05) return null;

      const res = await fetchNip05(_nip05.name, _nip05.domain);

      return res?.names[_nip05.name];
    },
  }));
};
