export const LOGIN_METHOD_STORAGE_KEY = "streets.v1.login-method";

export type LoginMethod = "nip07" | "nip46";

export const loadLoginMethod = (raw: string | null): LoginMethod | undefined =>
  raw === "nip07" || raw === "nip46" ? raw : undefined;

export const saveLoginMethod = (method: LoginMethod): string => method;
