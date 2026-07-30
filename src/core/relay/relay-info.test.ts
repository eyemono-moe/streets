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
    // Mutate the first result
    if (info1) {
      info1.name = "mutated";
      info1.supported_nips?.push(999);
    }

    // Second caller should get the original data
    const info2 = await registry.get("wss://a");
    expect(info2).toEqual({
      name: "relay",
      supported_nips: [1, 11, 50],
    });
  });
});
