import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * 開発時と E2E のビルド（`--mode e2e`）だけ、seedを置いたローカルリレーをbootstrapとfallbackへ使う。
 * 本番のビルドでは URL から読み書き先を変えさせない。
 */
export const devRelayOverride = (search: string): RelayUrl[] | undefined => {
  if (!import.meta.env.DEV && import.meta.env.MODE !== "e2e") return undefined;
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
