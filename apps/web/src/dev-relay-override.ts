import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** 開発時だけ、seedを置いたローカルリレーをbootstrapとfallbackへ使う。 */
export const devRelayOverride = (search: string): RelayUrl[] | undefined => {
  if (!import.meta.env.DEV) return undefined;
  const values = new URLSearchParams(search).getAll("relays");
  const relays = [
    ...new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) => normalizeRelayUrl(value.trim()))
        .filter((value): value is RelayUrl => {
          if (!value) return false;
          return LOOPBACK_HOSTS.has(new URL(value).hostname);
        }),
    ),
  ];
  return relays.length > 0 ? relays : undefined;
};
