/**
 * 開発者モードは**端末ごと**の設定であり、アカウントごとではない
 * (ADR-0026) —— どの端末で開発者として見ているかはアカウントの設定では
 * ないので、`deckStorageKey` のような pubkey の継ぎ足しはしない。
 */
export const DEVELOPER_MODE_STORAGE_KEY = "streets.v1.developerMode";

/** 既定は無効 (ADR-0026)。`"true"` 以外はすべて無効として扱う。 */
export const loadDeveloperMode = (raw: string | null): boolean =>
  raw === "true";

export const saveDeveloperMode = (enabled: boolean): string => String(enabled);
