import { parseZapPayInfo, zapEndpointOf } from "@streets/core/zap/lnurl";
import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { useProfileDetails } from "../note/use-profile";

/**
 * 自分の受け取り先のサーバーが Zap の受領に署名する鍵（LNURL-pay の
 * `nostrPubkey`）。受領が本物かを確かめるのに使う。受け取り先を書いていない・
 * 問い合わせられないときは `undefined`（そのときは鍵の確認を省く）。
 */
export const useOwnZapKey = (
  viewer: Accessor<string>,
): Accessor<string | undefined> => {
  const profile = useProfileDetails(viewer);
  const endpoint = () => zapEndpointOf(profile()?.content);
  const info = createQuery(() => ({
    queryKey: ["zap-pay-info", endpoint()?.url],
    queryFn: async () => {
      const url = endpoint()?.url;
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      return parseZapPayInfo(await response.json()) ?? null;
    },
    enabled: endpoint() !== undefined,
    retry: false,
  }));
  return () => info.data?.nostrPubkey;
};
