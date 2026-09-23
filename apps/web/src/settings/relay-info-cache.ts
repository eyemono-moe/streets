import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { fetchRelayInfo } from "@streets/core/relay/relay-info";
import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";

/**
 * リレーが自分について答えた内容。同じ URL の取得を共有し、24 時間は
 * 新鮮なデータとして扱う。使われなくなったデータも 7 日間はメモリに残る。
 */
export const useRelayInfo = (
  url: Accessor<RelayUrl>,
  enabled: Accessor<boolean>,
) =>
  createQuery(() => ({
    queryKey: ["relay-info", url()],
    queryFn: () => fetchRelayInfo(url()),
    enabled: enabled(),
  }));
