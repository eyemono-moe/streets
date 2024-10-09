import { createQuery } from "@tanstack/solid-query";
import { fetchOEmbed } from "../../../shared/libs/fetchOEmbed";
import { fetchOgp } from "../../../shared/libs/fetchOgp";

export const useQueryEmbed = (url: () => string | undefined) => {
  return createQuery(() => ({
    queryKey: ["embed", url()],
    queryFn: async () => {
      const oEmbed = await fetchOEmbed(url() ?? "");
      if (oEmbed)
        return {
          type: "oEmbed" as const,
          value: oEmbed,
        };

      const ogp = await fetchOgp(url() ?? "");
      if (ogp)
        return {
          type: "ogp" as const,
          value: ogp,
        };

      // const ogpWithoutProxy = await fetchOgp(url() ?? "", false);
      // if (ogpWithoutProxy)
      //   return {
      //     type: "ogp" as const,
      //     value: ogpWithoutProxy,
      //   };
      return null;
    },
    enabled: !!url(),
  }));
};
