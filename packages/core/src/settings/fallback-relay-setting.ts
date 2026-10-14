import { FALLBACK_RELAYS } from "../read/default-relays";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/**
 * リレーの設定が見つからない人の投稿を読む先や、自分の書き込みリレーが無いときの
 * 送り先に使う「既定のリレー」。端末ごとの設定 —— 投稿を読むリレーの決め方と同じく、
 * 効くかどうかがその端末の繋がり方で決まるため。
 */
export const FALLBACK_RELAYS_STORAGE_KEY = "streets.v1.fallbackRelays";

/** 既定のリレーは同時につなげる枠を必ず使うので、Outbox で選べる分を残す。 */
export const MAX_FALLBACK_RELAYS = 5;

/** 未保存・読めない値は空（Streets が決めたリレーを使う）。 */
export const loadFallbackRelays = (raw: string | null): RelayUrl[] => {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const urls = new Set<RelayUrl>();
  for (const item of parsed) {
    const url = typeof item === "string" ? normalizeRelayUrl(item) : undefined;
    if (url) urls.add(url);
    if (urls.size >= MAX_FALLBACK_RELAYS) break;
  }
  return [...urls];
};

export const saveFallbackRelays = (relays: readonly RelayUrl[]): string =>
  JSON.stringify(relays.slice(0, MAX_FALLBACK_RELAYS));

/** 1 本も指定していなければ、Streets が決めたリレーを使う。 */
export const fallbackRelaysInUse = (
  custom: readonly RelayUrl[],
): readonly RelayUrl[] => (custom.length > 0 ? custom : FALLBACK_RELAYS);
