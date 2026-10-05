export const LOGIN_METHOD_STORAGE_KEY = "streets.v1.login-method";
/**
 * 拡張機能でログインした人の公開鍵。再読み込みの直後、拡張機能の返事を待たずに
 * その人の画面を出すために覚える（NIP-46 はセッションの保存に含まれている）。
 */
export const LOGIN_PUBKEY_STORAGE_KEY = "streets.v1.login-pubkey";

export type LoginMethod = "nip07" | "nip46";

export const loadLoginMethod = (raw: string | null): LoginMethod | undefined =>
  raw === "nip07" || raw === "nip46" ? raw : undefined;

export const saveLoginMethod = (method: LoginMethod): string => method;

const HEX64 = /^[0-9a-f]{64}$/;

export const loadLoginPubkey = (raw: string | null): string | undefined =>
  raw !== null && HEX64.test(raw) ? raw : undefined;
