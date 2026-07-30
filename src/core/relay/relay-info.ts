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

/**
 * NIP-11 の取得とキャッシュ。
 * ブラウザから relay のドメインへ直接 GET するため CORS で失敗しうる。
 * 失敗は例外にせず undefined を返し、呼び出し側は情報なしで動作を続ける (ADR-0020)。
 */
export class RelayInfoRegistry {
  readonly #fetch: typeof fetch;
  readonly #cache = new Map<RelayUrl, Promise<RelayInfo | undefined>>();

  constructor(fetchImpl: typeof fetch = fetch) {
    this.#fetch = fetchImpl;
  }

  get(url: RelayUrl): Promise<RelayInfo | undefined> {
    const cached = this.#cache.get(url);
    if (cached) {
      // Wrap to make a copy for each caller, preventing state leakage
      return cached.then((result) =>
        result ? JSON.parse(JSON.stringify(result)) : undefined,
      );
    }

    const pending = this.#load(url);
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
      return data as RelayInfo;
    } catch {
      return undefined;
    }
  }
}
