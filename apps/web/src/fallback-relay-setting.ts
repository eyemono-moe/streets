import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  FALLBACK_RELAYS_STORAGE_KEY,
  fallbackRelaysInUse,
  loadFallbackRelays,
  saveFallbackRelays,
} from "@streets/core/settings/fallback-relay-setting";
import { createSignal } from "solid-js";

const read = (): RelayUrl[] => {
  try {
    return loadFallbackRelays(
      localStorage.getItem(FALLBACK_RELAYS_STORAGE_KEY),
    );
  } catch {
    return [];
  }
};

const [customFallbackRelays, setCustom] =
  createSignal<readonly RelayUrl[]>(read());

/** 自分で指定した既定のリレー（この端末の設定）。空なら Streets が決めたリレーを使う。 */
export { customFallbackRelays };

/** いま使う既定のリレー。 */
export const fallbackRelays = (): readonly RelayUrl[] =>
  fallbackRelaysInUse(customFallbackRelays());

export const setFallbackRelays = (relays: readonly RelayUrl[]) => {
  setCustom([...relays]);
  try {
    localStorage.setItem(
      FALLBACK_RELAYS_STORAGE_KEY,
      saveFallbackRelays(relays),
    );
  } catch {
    // 保存できなくても、今の画面には当たっている。
  }
};
