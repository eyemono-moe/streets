import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { nappletScope, parseNappletManifest } from "./manifest";

const PUBKEY = "b".repeat(64);
const HASH = "186ea5fd14e88fd1ac49351759e7ab906fa94892002b60bf7f5a428f28ca1c99";

const event = (overrides: Partial<NostrEvent>): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: PUBKEY,
  created_at: 1_760_000_000,
  kind: 35129,
  content: "A napplet",
  tags: [
    ["d", "my-napplet"],
    ["x", HASH],
  ],
  sig: "c".repeat(128),
  ...overrides,
});

describe("parseNappletManifest", () => {
  // NIP-5D（PR #2303、2026-10-17 版）の Manifest の例をそのまま読ませる。
  it("NIP-5D の名前付き napplet の例を読む", () => {
    const result = parseNappletManifest(
      event({
        content: "A feed viewer and editor hosted on Nostr",
        tags: [
          ["d", "my-napplet"],
          ["x", HASH],
          ["z", "feed"],
          ["i", "napplet:feed/open"],
          ["i", "napplet:feed/edit", "filters", "relays"],
          ["R", "relay"],
          ["O", "theme"],
          [
            "icon",
            "ae7a3bd1a3fa9d824d0e64a6f57fe6cb4dd80c423786b6a2ecb94d587c94c75a",
            "image/png",
          ],
          ["server", "https://blossom.example.com"],
          ["title", "My Napplet"],
          ["source", "https://github.com/example/my-napplet"],
        ],
      }),
    );
    expect(result).toEqual({
      ok: true,
      manifest: {
        eventId: "a".repeat(64),
        kind: 35129,
        pubkey: PUBKEY,
        identifier: "my-napplet",
        artifactHash: HASH,
        description: "A feed viewer and editor hosted on Nostr",
        title: "My Napplet",
        servers: ["https://blossom.example.com"],
        requires: ["relay"],
        optional: ["theme"],
        source: "https://github.com/example/my-napplet",
        createdAt: 1_760_000_000,
        archetypes: ["feed"],
        // NAP-INTENT: > A napplet repeats `z` for multiple roles and `i` for multiple accepted intents
        intents: [
          { convention: "napplet:feed/open", params: [] },
          { convention: "napplet:feed/edit", params: ["filters", "relays"] },
        ],
        icon: {
          hash: "ae7a3bd1a3fa9d824d0e64a6f57fe6cb4dd80c423786b6a2ecb94d587c94c75a",
          mime: "image/png",
        },
        legacy: false,
      },
    });
  });

  // > a manifest that does not carry exactly one `x` tag MUST be rejected.
  it("x タグがちょうど 1 つでないマニフェストを断る", () => {
    expect(parseNappletManifest(event({ tags: [["d", "n"]] }))).toEqual({
      ok: false,
      error: "missing-hash",
    });
    expect(
      parseNappletManifest(
        event({
          tags: [
            ["d", "n"],
            ["x", HASH],
            ["x", HASH],
          ],
        }),
      ),
    ).toEqual({ ok: false, error: "multiple-hashes" });
  });

  // > The manifest MUST carry exactly one `x` tag holding the lowercase-hex sha256
  it("小文字の 16 進でないハッシュを断る", () => {
    expect(
      parseNappletManifest(
        event({
          tags: [
            ["d", "n"],
            ["x", HASH.toUpperCase()],
          ],
        }),
      ),
    ).toEqual({ ok: false, error: "invalid-hash" });
  });

  // > The event `content` MUST contain a non-empty, human-readable plain-text description
  it("説明の無いマニフェストを断る", () => {
    expect(parseNappletManifest(event({ content: "  " }))).toEqual({
      ok: false,
      error: "missing-description",
    });
  });

  it("d タグの無い名前付き napplet を断る", () => {
    expect(parseNappletManifest(event({ tags: [["x", HASH]] }))).toEqual({
      ok: false,
      error: "missing-identifier",
    });
  });

  // napplet/migrate の docs/migration.md の対応表のとおりに、古い形を読む。
  it("古い形のマニフェストは path の /index.html を本体として読む", () => {
    const result = parseNappletManifest(
      event({
        content: "",
        tags: [
          ["d", "minesweeper"],
          ["path", "/index.html", HASH],
          ["x", "5".repeat(64), "aggregate"],
          ["server", "https://cdn.hzrd149.com"],
          ["title", "Minesweeper"],
          ["description", "A Windows XP-style Minesweeper game."],
          ["requires", "identity"],
          ["requires", "outbox"],
        ],
      }),
    );
    expect(result.ok && result.manifest).toMatchObject({
      artifactHash: HASH,
      description: "A Windows XP-style Minesweeper game.",
      requires: ["identity", "outbox"],
      optional: [],
      legacy: true,
    });
  });

  // > | `x <aggregate-hash> aggregate` | Removed; never reused as the artifact hash |
  it("古い形のまとめたハッシュを本体のハッシュとして使わない", () => {
    expect(
      parseNappletManifest(
        event({
          tags: [
            ["d", "n"],
            ["x", HASH, "aggregate"],
          ],
        }),
      ),
    ).toEqual({ ok: false, error: "missing-hash" });
  });

  // > multi-file manifests block migration.
  it("index.html 以外のファイルも持つ古い形は断る", () => {
    expect(
      parseNappletManifest(
        event({
          tags: [
            ["d", "n"],
            ["path", "/index.html", HASH],
            ["path", "/app.js", "6".repeat(64)],
          ],
        }),
      ),
    ).toEqual({ ok: false, error: "legacy-multi-file" });
  });

  it("napplet の kind でないイベントは読まない", () => {
    expect(parseNappletManifest(event({ kind: 35128 }))).toEqual({
      ok: false,
      error: "not-napplet",
    });
  });

  it("Blossom のサーバーを https の origin にそろえ、読めないものを捨てる", () => {
    const result = parseNappletManifest(
      event({
        tags: [
          ["d", "n"],
          ["x", HASH],
          ["server", "https://cdn.example.com/"],
          ["server", "https://cdn.example.com"],
          ["server", "http://plain.example.com"],
          ["server", "not a url"],
        ],
      }),
    );
    expect(result.ok && result.manifest.servers).toEqual([
      "https://cdn.example.com",
    ]);
  });
});

describe("nappletScope", () => {
  const manifest = (overrides: Partial<NostrEvent>) => {
    const result = parseNappletManifest(event(overrides));
    if (!result.ok) throw new Error(result.error);
    return result.manifest;
  };

  // NAP-STORAGE: > A bare `d` value MUST NOT identify a scope.
  it("同じ名前でも、発行者か本体が違えば保存先を分ける", () => {
    const base = nappletScope(manifest({}));
    expect(nappletScope(manifest({ pubkey: "d".repeat(64) }))).not.toBe(base);
    expect(
      nappletScope(
        manifest({
          tags: [
            ["d", "my-napplet"],
            ["x", "e".repeat(64)],
          ],
        }),
      ),
    ).not.toBe(base);
  });

  // NAP-STORAGE: > for a snapshot, its signed event id.
  it("スナップショットはイベント id で分ける", () => {
    const snapshot = (id: string) =>
      nappletScope(manifest({ kind: 5129, id, tags: [["x", HASH]] }));
    expect(snapshot("1".repeat(64))).not.toBe(snapshot("2".repeat(64)));
  });
});
