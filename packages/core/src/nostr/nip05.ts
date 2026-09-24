import * as v from "valibot";

/** `name@domain` を分けたもの。name は小文字にそろえてある。 */
export type Nip05Address = { name: string; domain: string };

// NIP-05 の名前の部分は a-z 0-9 - _ . だけ。大文字で書く人もいるので小文字にそろえて読む。
const NAME = /^[a-z0-9._-]+$/;

/**
 * kind:0 の `nip05` を読む。形が崩れたもの（`@` が無い、ドメインにパスが付いている
 * など）は undefined —— 取りに行く先を決められないものは、確かめずに出さない。
 */
export const parseNip05 = (text: string): Nip05Address | undefined => {
  const at = text.trim().lastIndexOf("@");
  if (at <= 0) return undefined;
  const name = text.trim().slice(0, at).toLowerCase();
  const domain = text
    .trim()
    .slice(at + 1)
    .toLowerCase();
  if (!NAME.test(name)) return undefined;
  // URL に読ませて、ホスト名だけで書かれているかを確かめる。
  try {
    if (new URL(`https://${domain}`).host !== domain) return undefined;
  } catch {
    return undefined;
  }
  if (!domain.includes(".")) return undefined;
  return { name, domain };
};

/** 画面に出す形。`_@domain` はドメインそのものを指すので、ドメインだけにする。 */
export const nip05Label = (address: Nip05Address): string =>
  address.name === "_" ? address.domain : `${address.name}@${address.domain}`;

/** ドメインに聞いた答え。 */
export type Nip05Lookup =
  | { kind: "found"; pubkey: string }
  /** 答えは返ったが、その名前が載っていない。 */
  | { kind: "missing" }
  /** 接続できない、読める形で返らない、転送された（NIP-05 は転送に従わない）。 */
  | { kind: "unreachable" };

const responseSchema = v.object({
  names: v.record(v.string(), v.unknown()),
});

export const nip05Url = (address: Nip05Address): string =>
  `https://${address.domain}/.well-known/nostr.json?name=${encodeURIComponent(address.name)}`;

const TIMEOUT_MS = 5000;

/** 失敗は例外にせず `unreachable` で返す。答えないドメインは珍しくない。 */
export const fetchNip05 = async (
  address: Nip05Address,
  fetcher: typeof fetch = fetch,
): Promise<Nip05Lookup> => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(nip05Url(address), {
      headers: { Accept: "application/json" },
      // 転送先の答えを信じると、ドメインの持ち主でない人が本人確認を出せてしまう。
      redirect: "error",
      signal: abort.signal,
    });
    if (!response.ok) return { kind: "unreachable" };
    const parsed = v.safeParse(responseSchema, await response.json());
    if (!parsed.success) return { kind: "unreachable" };
    const names = parsed.output.names;
    const key =
      address.name in names
        ? address.name
        : Object.keys(names).find((key) => key.toLowerCase() === address.name);
    const pubkey = key === undefined ? undefined : names[key];
    return typeof pubkey === "string" && /^[0-9a-f]{64}$/i.test(pubkey)
      ? { kind: "found", pubkey: pubkey.toLowerCase() }
      : { kind: "missing" };
  } catch {
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * その人の NIP-05 が確かめられたか。`mismatch` はドメインが別の人を返したか、
 * その名前を載せていない —— どちらも、ドメインがこの人を認めていない。
 * `unreachable` はドメインに聞けなかっただけで、認めていないとは限らない。
 */
export type Nip05Status = "pending" | "verified" | "mismatch" | "unreachable";

export const nip05Status = (
  lookup: Nip05Lookup | undefined,
  pubkey: string,
): Nip05Status => {
  if (lookup === undefined) return "pending";
  switch (lookup.kind) {
    case "found":
      return lookup.pubkey === pubkey.toLowerCase() ? "verified" : "mismatch";
    case "missing":
      return "mismatch";
    case "unreachable":
      return "unreachable";
  }
};
