import type { RelayUrl } from "./relay-connection";

/** NIP-11 リレー情報ドキュメント。必要なフィールドだけを型にする。 */
export type RelayInfo = {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  icon?: string;
  posting_policy?: string;
  limitation?: {
    max_limit?: number;
    max_subscriptions?: number;
    auth_required?: boolean;
    payment_required?: boolean;
  };
};

export const relayInfoUrl = (url: RelayUrl): string =>
  url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const STRING_FIELDS = [
  "name",
  "description",
  "pubkey",
  "contact",
  "software",
  "version",
  "icon",
  "posting_policy",
] as const;

const LIMITATION_NUMBER_FIELDS = ["max_limit", "max_subscriptions"] as const;
const LIMITATION_BOOLEAN_FIELDS = [
  "auth_required",
  "payment_required",
] as const;

/**
 * NIP-11 は認証されていない任意オリジンからのデータで、イベントと違って
 * 署名による裏付けが無い。フィールドが宣言された型と違えば黙って落とす
 * ("こういう値だ" と主張するだけの JSON をそのまま信用しない)。スキーマ
 * ライブラリではなく、素朴な形整形にとどめる。
 */
const sanitizeRelayInfo = (raw: Record<string, unknown>): RelayInfo => {
  const info: RelayInfo = {};

  for (const field of STRING_FIELDS) {
    const value = raw[field];
    if (typeof value === "string") info[field] = value;
  }

  if (
    Array.isArray(raw.supported_nips) &&
    raw.supported_nips.every((nip) => typeof nip === "number")
  ) {
    info.supported_nips = raw.supported_nips as number[];
  }

  const rawLimitation = raw.limitation;
  if (
    typeof rawLimitation === "object" &&
    rawLimitation !== null &&
    !Array.isArray(rawLimitation)
  ) {
    const rawLimitationRecord = rawLimitation as Record<string, unknown>;
    const limitation: NonNullable<RelayInfo["limitation"]> = {};

    for (const field of LIMITATION_NUMBER_FIELDS) {
      const value = rawLimitationRecord[field];
      if (typeof value === "number") limitation[field] = value;
    }
    for (const field of LIMITATION_BOOLEAN_FIELDS) {
      const value = rawLimitationRecord[field];
      if (typeof value === "boolean") limitation[field] = value;
    }

    info.limitation = limitation;
  }

  return info;
};

/**
 * NIP-11 の取得とキャッシュ。
 * ブラウザから relay のドメインへ直接 GET するため CORS で失敗しうる。
 * 失敗は例外にせず undefined を返し、呼び出し側は情報なしで動作を続ける (ADR-0020)。
 */
export class RelayInfoRegistry {
  readonly #fetch: typeof fetch;
  readonly #cache = new Map<RelayUrl, Promise<RelayInfo | undefined>>();

  constructor(fetchImpl: typeof fetch = fetch) {
    // `this.#fetch(...)` below is a method-style call, so it invokes
    // `fetchImpl` with `this` bound to the RelayInfoRegistry instance rather
    // than `window`. The real, native `fetch` requires `this` to be a
    // fetch-capable global and throws "Illegal invocation" otherwise, so the
    // unbound reference must be bound up front.
    this.#fetch = fetchImpl.bind(globalThis);
  }

  get(url: RelayUrl): Promise<RelayInfo | undefined> {
    const cached = this.#cache.get(url);
    if (cached) {
      // Wrap to make a copy for each caller, preventing state leakage
      return cached.then((result) =>
        result ? JSON.parse(JSON.stringify(result)) : undefined,
      );
    }

    // 失敗 (undefined) はキャッシュに残さない: 起動時の一時的なオフライン
    // が、そのタブが生きている間ずっとそのリレーを "情報なし" に固定して
    // しまわないよう、次の get() で再挑戦できるようにする。進行中の
    // Promise 自体はここで #cache に置くので、同時に来た呼び出し同士は
    // 1 回のフェッチに相乗りする (in-flight coalescing は維持)。
    const pending = this.#load(url).then((result) => {
      if (result === undefined) this.#cache.delete(url);
      return result;
    });
    this.#cache.set(url, pending);
    // Wrap to make a copy, preventing state leakage
    return pending.then((result) =>
      result ? JSON.parse(JSON.stringify(result)) : undefined,
    );
  }

  async supportsNip(url: RelayUrl, nip: number): Promise<boolean> {
    const info = await this.get(url);
    return info?.supported_nips?.includes(nip) ?? false;
  }

  async maxLimit(url: RelayUrl): Promise<number | undefined> {
    return (await this.get(url))?.limitation?.max_limit;
  }

  async #load(url: RelayUrl): Promise<RelayInfo | undefined> {
    try {
      const response = await this.#fetch(relayInfoUrl(url), {
        headers: { Accept: "application/nostr+json" },
      });
      if (!response.ok) return undefined;
      const data = await response.json();
      // Validate that the response is an object (not null, array, or primitive)
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return undefined;
      }
      return sanitizeRelayInfo(data as Record<string, unknown>);
    } catch {
      return undefined;
    }
  }
}
