import * as v from "valibot";
import {
  NIP46_SESSION_STORAGE_KEY,
  type StoredNip46SessionV3,
  loadNip46Session,
  parseNip46Session,
} from "../nip46/session-storage";

export const LOGIN_STORAGE_KEY = "streets.v1.login";

/**
 * 1 つの記録にまとめる前の保存先。読み替えたら消す。読み替えを外すと、
 * 前の版でログインした人が全員ログアウトされる。
 */
const LEGACY_METHOD_KEY = "streets.v1.login-method";
const LEGACY_PUBKEY_KEY = "streets.v1.login-pubkey";
export const LEGACY_LOGIN_KEYS = [
  LEGACY_METHOD_KEY,
  LEGACY_PUBKEY_KEY,
  NIP46_SESSION_STORAGE_KEY,
] as const;

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

export type StoredLogin =
  | {
      version: 1;
      method: "nip07";
      /** 再読み込みの直後、拡張機能の返事を待たずにその人の画面を出すため。 */
      pubkey?: string;
    }
  | { version: 1; method: "nip46"; session: StoredNip46SessionV3 };

const recordSchema = v.variant("method", [
  v.strictObject({
    version: v.literal(1),
    method: v.literal("nip07"),
    pubkey: v.optional(hex64),
  }),
  v.strictObject({
    version: v.literal(1),
    method: v.literal("nip46"),
    session: v.unknown(),
  }),
]);

export type LoadedLogin =
  | { type: "none" }
  | { type: "login"; login: StoredLogin; legacy: boolean }
  /** 保存はあるが読めない。黙って消すと、なぜログアウトしたのか分からない。 */
  | { type: "unreadable" };

const parseRecord = (raw: string): StoredLogin | undefined => {
  try {
    const record = v.parse(recordSchema, JSON.parse(raw));
    if (record.method === "nip07") {
      return record.pubkey === undefined
        ? { version: 1, method: "nip07" }
        : { version: 1, method: "nip07", pubkey: record.pubkey };
    }
    const session = parseNip46Session(record.session);
    return session && { version: 1, method: "nip46", session };
  } catch {
    return undefined;
  }
};

const readLegacy = (storage: Pick<Storage, "getItem">): LoadedLogin => {
  const method = storage.getItem(LEGACY_METHOD_KEY);
  const session = storage.getItem(NIP46_SESSION_STORAGE_KEY);
  if (method === "nip07") {
    const pubkey = storage.getItem(LEGACY_PUBKEY_KEY);
    return {
      type: "login",
      legacy: true,
      login:
        pubkey !== null && /^[0-9a-f]{64}$/.test(pubkey)
          ? { version: 1, method: "nip07", pubkey }
          : { version: 1, method: "nip07" },
    };
  }
  // 方式を覚える前の版は、NIP-46 のセッションだけを保存していた。
  if (method !== "nip46" && session === null) return { type: "none" };
  const stored = loadNip46Session(session);
  return stored
    ? {
        type: "login",
        legacy: true,
        login: { version: 1, method: "nip46", session: stored },
      }
    : { type: "unreadable" };
};

export const loadStoredLogin = (
  storage: Pick<Storage, "getItem">,
): LoadedLogin => {
  const raw = storage.getItem(LOGIN_STORAGE_KEY);
  if (raw === null) return readLegacy(storage);
  const login = parseRecord(raw);
  return login
    ? { type: "login", login, legacy: false }
    : { type: "unreadable" };
};

export const saveStoredLogin = (login: StoredLogin): string => {
  const record = JSON.stringify(login);
  if (!parseRecord(record)) throw new Error("invalid stored login");
  return record;
};

export const storedLoginPubkey = (login: StoredLogin): string | undefined =>
  login.method === "nip07" ? login.pubkey : login.session.userPubkey;
