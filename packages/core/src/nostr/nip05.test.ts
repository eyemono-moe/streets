import { describe, expect, it } from "vite-plus/test";
import {
  fetchNip05,
  nip05Label,
  nip05Status,
  nip05Url,
  parseNip05,
} from "./nip05";

const pubkey = "a".repeat(64);

describe("parseNip05", () => {
  it("名前とドメインに分け、小文字にそろえる", () => {
    expect(parseNip05(" Alice@Example.COM ")).toEqual({
      name: "alice",
      domain: "example.com",
    });
  });

  it("_ はそのまま読む", () => {
    expect(parseNip05("_@example.com")).toEqual({
      name: "_",
      domain: "example.com",
    });
  });

  it.each([
    "example.com",
    "@example.com",
    "alice@",
    "alice@localhost",
    "al ice@example.com",
    "アリス@example.com",
    "alice@example.com/path",
    "alice@example.com?x=1",
    "alice@exa mple.com",
  ])("取りに行く先を決められない %s は読まない", (text) => {
    expect(parseNip05(text)).toBeUndefined();
  });
});

describe("nip05Label", () => {
  it("_ はドメインだけにする", () => {
    expect(nip05Label({ name: "_", domain: "example.com" })).toBe(
      "example.com",
    );
    expect(nip05Label({ name: "alice", domain: "example.com" })).toBe(
      "alice@example.com",
    );
  });
});

describe("nip05Url", () => {
  it("名前をクエリに入れる", () => {
    expect(nip05Url({ name: "a.b", domain: "example.com" })).toBe(
      "https://example.com/.well-known/nostr.json?name=a.b",
    );
  });
});

const respond =
  (body: unknown, init: ResponseInit = {}): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), init);

describe("fetchNip05", () => {
  const address = { name: "alice", domain: "example.com" };

  it("載っている pubkey を小文字で返す", async () => {
    expect(
      await fetchNip05(
        address,
        respond({ names: { alice: pubkey.toUpperCase() } }),
      ),
    ).toEqual({
      kind: "found",
      pubkey,
    });
  });

  it("大文字で載っている名前も見つける", async () => {
    expect(
      await fetchNip05(address, respond({ names: { Alice: pubkey } })),
    ).toEqual({
      kind: "found",
      pubkey,
    });
  });

  it("名前が載っていなければ missing", async () => {
    expect(
      await fetchNip05(address, respond({ names: { bob: pubkey } })),
    ).toEqual({
      kind: "missing",
    });
  });

  it("pubkey の形でなければ missing", async () => {
    expect(
      await fetchNip05(address, respond({ names: { alice: "npub1xyz" } })),
    ).toEqual({
      kind: "missing",
    });
  });

  it("エラーの応答・形の違う答え・接続できないは unreachable", async () => {
    expect(await fetchNip05(address, respond({}, { status: 404 }))).toEqual({
      kind: "unreachable",
    });
    expect(await fetchNip05(address, respond({ names: "alice" }))).toEqual({
      kind: "unreachable",
    });
    expect(
      await fetchNip05(address, async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).toEqual({ kind: "unreachable" });
  });

  it("転送には従わない", async () => {
    let init: RequestInit | undefined;
    await fetchNip05(address, async (_, given) => {
      init = given;
      return new Response("{}");
    });
    expect(init?.redirect).toBe("error");
  });
});

describe("nip05Status", () => {
  it("答えと pubkey を突き合わせる", () => {
    expect(nip05Status(undefined, pubkey)).toBe("pending");
    expect(nip05Status({ kind: "found", pubkey }, pubkey.toUpperCase())).toBe(
      "verified",
    );
    expect(nip05Status({ kind: "found", pubkey: "b".repeat(64) }, pubkey)).toBe(
      "mismatch",
    );
    expect(nip05Status({ kind: "missing" }, pubkey)).toBe("mismatch");
    expect(nip05Status({ kind: "unreachable" }, pubkey)).toBe("unreachable");
  });
});
