import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { fetchNappletArtifact } from "./artifact";

const HTML = "<!doctype html><title>napplet</title>";
const HASH = bytesToHex(sha256(new TextEncoder().encode(HTML)));

const fakeFetch =
  (answers: Record<string, string | number>) => async (url: string) => {
    const answer = answers[url];
    if (answer === undefined) throw new TypeError("network error");
    return typeof answer === "number"
      ? new Response(null, { status: answer })
      : new Response(answer);
  };

describe("fetchNappletArtifact", () => {
  it("ハッシュで取った本体を照合して返す", async () => {
    const result = await fetchNappletArtifact(
      HASH,
      ["https://a.example"],
      fakeFetch({ [`https://a.example/${HASH}`]: HTML }),
    );
    expect(result).toEqual({
      ok: true,
      html: HTML,
      server: "https://a.example",
    });
  });

  // NIP-5D: > the gateway is never trusted.
  it("中身がハッシュと違うサーバーを飛ばし、次のサーバーで取る", async () => {
    const result = await fetchNappletArtifact(
      HASH,
      ["https://evil.example", "https://good.example"],
      fakeFetch({
        [`https://evil.example/${HASH}`]: "<script>steal()</script>",
        [`https://good.example/${HASH}`]: HTML,
      }),
    );
    expect(result).toEqual({
      ok: true,
      html: HTML,
      server: "https://good.example",
    });
  });

  it("どのサーバーも偽物しか返さなければ、取れなかったのではなく食い違いとして返す", async () => {
    const result = await fetchNappletArtifact(
      HASH,
      ["https://evil.example", "https://down.example"],
      fakeFetch({
        [`https://evil.example/${HASH}`]: "tampered",
        [`https://down.example/${HASH}`]: 404,
      }),
    );
    expect(result).toEqual({ ok: false, error: "hash-mismatch" });
  });

  it("どのサーバーからも取れなければ、取れなかったとして返す", async () => {
    const result = await fetchNappletArtifact(
      HASH,
      ["https://down.example", "https://offline.example"],
      fakeFetch({ [`https://down.example/${HASH}`]: 500 }),
    );
    expect(result).toEqual({ ok: false, error: "unavailable" });
  });

  it("サーバーが 1 つも無ければ、取りに行かない", async () => {
    const result = await fetchNappletArtifact(HASH, [], fakeFetch({}));
    expect(result).toEqual({ ok: false, error: "no-server" });
  });
});
