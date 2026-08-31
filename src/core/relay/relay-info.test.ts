import { describe, expect, it, vi } from "vitest";
import { RelayInfoRegistry, relayInfoUrl } from "./relay-info";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/nostr+json" },
  });

describe("relayInfoUrl", () => {
  it("swaps the websocket scheme for http", () => {
    expect(relayInfoUrl("wss://relay.example")).toBe("https://relay.example");
    expect(relayInfoUrl("ws://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });
});

describe("RelayInfoRegistry", () => {
  it("requests the document with the NIP-11 accept header", async () => {
    const fetchImpl = vi.fn(async () => json({ name: "test relay" }));
    const registry = new RelayInfoRegistry(
      fetchImpl as unknown as typeof fetch,
    );

    await registry.get("wss://relay.example");

    expect(fetchImpl).toHaveBeenCalledWith("https://relay.example", {
      headers: { Accept: "application/nostr+json" },
    });
  });

  it("returns the parsed document", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "test relay",
        supported_nips: [1, 11, 50],
        limitation: { max_limit: 500 },
      })) as unknown as typeof fetch);

    await expect(registry.get("wss://relay.example")).resolves.toEqual({
      name: "test relay",
      supported_nips: [1, 11, 50],
      limitation: { max_limit: 500 },
    });
  });

  it("fetches each relay only once", async () => {
    const fetchImpl = vi.fn(async () => json({ name: "test relay" }));
    const registry = new RelayInfoRegistry(
      fetchImpl as unknown as typeof fetch,
    );

    await Promise.all([
      registry.get("wss://relay.example"),
      registry.get("wss://relay.example"),
    ]);
    await registry.get("wss://relay.example");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the request fails (CORS, offline, 404)", async () => {
    const registry = new RelayInfoRegistry((async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when the body is not valid json", async () => {
    const registry = new RelayInfoRegistry(
      (async () =>
        new Response("<html>nope</html>", {
          status: 200,
        })) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("answers supportsNip from supported_nips", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({ supported_nips: [1, 11, 50] })) as unknown as typeof fetch);

    await expect(registry.supportsNip("wss://a", 50)).resolves.toBe(true);
    await expect(registry.supportsNip("wss://a", 45)).resolves.toBe(false);
  });

  it("treats an unreachable relay as not supporting a nip", async () => {
    const registry = new RelayInfoRegistry((async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);

    await expect(registry.supportsNip("wss://a", 50)).resolves.toBe(false);
  });

  it("exposes limitation.max_limit", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({ limitation: { max_limit: 250 } })) as unknown as typeof fetch);

    await expect(registry.maxLimit("wss://a")).resolves.toBe(250);
  });

  it("prevents state leakage by making a copy for each caller", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "relay",
        supported_nips: [1, 11, 50],
      })) as unknown as typeof fetch);

    const info1 = await registry.get("wss://a");
    if (info1) {
      info1.name = "mutated";
      info1.supported_nips?.push(999);
    }

    const info2 = await registry.get("wss://a");
    expect(info2).toEqual({
      name: "relay",
      supported_nips: [1, 11, 50],
    });
  });

  it("returns undefined when response status is 404", async () => {
    const registry = new RelayInfoRegistry(
      (async () =>
        new Response(JSON.stringify({ name: "test" }), {
          status: 404,
        })) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when response status is 500", async () => {
    const registry = new RelayInfoRegistry(
      (async () =>
        new Response(JSON.stringify({ name: "test" }), {
          status: 500,
        })) as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when the response body is null", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json(null)) as unknown as typeof fetch);

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when the response body is a number", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json(42)) as unknown as typeof fetch);

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  it("returns undefined when the response body is an array", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json([1, 2, 3])) as unknown as typeof fetch);

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
  });

  // NIP-11 は署名のない任意オリジンのデータなので、フィールドが宣言された
  // 型と違う場合に黙って落とさないと、`.join(",")` を呼ぶような消費者が
  // 型どおりの配列だと思っていた場所で非配列に遭遇しうる。
  it("drops supported_nips when it is not an array of numbers (string)", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "relay",
        supported_nips: "1,11",
      })) as unknown as typeof fetch);

    await expect(registry.get("wss://a")).resolves.toEqual({ name: "relay" });
  });

  it("drops supported_nips when it is not an array of numbers (object)", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({ name: "relay", supported_nips: {} })) as unknown as typeof fetch);

    await expect(registry.get("wss://a")).resolves.toEqual({ name: "relay" });
  });

  it("drops supported_nips when it is a mixed array (not every element a number)", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "relay",
        supported_nips: [1, "11", 50],
      })) as unknown as typeof fetch);

    await expect(registry.get("wss://a")).resolves.toEqual({ name: "relay" });
  });

  it("drops limitation entirely when it is not an object (string)", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "relay",
        limitation: "unlimited",
      })) as unknown as typeof fetch);

    await expect(registry.get("wss://a")).resolves.toEqual({ name: "relay" });
  });

  it("drops only the malformed field inside limitation, keeping the rest", async () => {
    const registry = new RelayInfoRegistry((async () =>
      json({
        name: "relay",
        limitation: { max_limit: "500", max_subscriptions: 10 },
      })) as unknown as typeof fetch);

    await expect(registry.get("wss://a")).resolves.toEqual({
      name: "relay",
      limitation: { max_subscriptions: 10 },
    });
  });

  // 起動時の一時的なオフラインでタブの生存期間ずっとそのリレーを死んだ
  // ものとして固定してはいけないので、成功だけをキャッシュし、失敗は
  // 次の get() で再挑戦できるようにする。
  it("retries after a failed fetch instead of caching the failure permanently", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return json({ name: "test relay" });
    });
    const registry = new RelayInfoRegistry(
      fetchImpl as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toBeUndefined();
    await expect(registry.get("wss://relay.example")).resolves.toEqual({
      name: "test relay",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("still coalesces concurrent callers into a single fetch while a request is in flight", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const registry = new RelayInfoRegistry(
      fetchImpl as unknown as typeof fetch,
    );

    const first = registry.get("wss://relay.example");
    const second = registry.get("wss://relay.example");
    resolveFetch?.(json({ name: "test relay" }));

    await expect(first).resolves.toEqual({ name: "test relay" });
    await expect(second).resolves.toEqual({ name: "test relay" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("regression: does not lose `this` binding when calling the injected fetch (native fetch throws 'Illegal invocation' if called as a method of another object)", async () => {
    // Native `fetch` is receiver-sensitive (`this` must be a fetch-capable
    // global); calling it as `this.#fetch(...)` rebinds `this`, which real
    // browsers reject but vitest/jsdom's fetch may not — so this double
    // models the rejection directly to keep the regression caught.
    const fetchCapableGlobals = new WeakSet<object>();
    fetchCapableGlobals.add(globalThis);

    function fetchImpl(this: unknown) {
      if (!fetchCapableGlobals.has(this as object)) {
        throw new TypeError("Failed to execute 'fetch': Illegal invocation");
      }
      return Promise.resolve(json({ name: "test relay" }));
    }

    const registry = new RelayInfoRegistry(
      fetchImpl as unknown as typeof fetch,
    );

    await expect(registry.get("wss://relay.example")).resolves.toEqual({
      name: "test relay",
    });
  });
});
