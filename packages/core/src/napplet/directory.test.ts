import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { installedDirectory, nappletDirectory } from "./directory";

const HASH = "e".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const manifest = (
  pubkey: string,
  identifier: string,
  createdAt: number,
  tags: string[][] = [],
  content = `${identifier} の説明`,
): NostrEvent => ({
  id: `${pubkey.slice(0, 8)}${identifier}${createdAt}`.padEnd(64, "0"),
  pubkey,
  created_at: createdAt,
  kind: 35129,
  content,
  tags: [["d", identifier], ["x", HASH], ...tags],
  sig: "c".repeat(128),
});

const options = {
  query: "",
  supported: new Set(["relay", "identity"]),
  compatibleOnly: false,
  followees: new Set<string>(),
};

const ids = (entries: ReturnType<typeof nappletDirectory>) =>
  entries.map((entry) => entry.manifest.identifier);

describe("nappletDirectory", () => {
  it("同じ napplet は最新の版だけを出し、新しい順に並べる", () => {
    const entries = nappletDirectory(
      [
        manifest(ALICE, "feed", 100),
        manifest(ALICE, "feed", 300, [["title", "Feed v2"]]),
        manifest(BOB, "game", 200),
      ],
      options,
    );
    expect(ids(entries)).toEqual(["feed", "game"]);
    expect(entries[0]?.manifest.title).toBe("Feed v2");
  });

  it("フォロー中の人が作ったものを先に出す", () => {
    const entries = nappletDirectory(
      [manifest(ALICE, "new", 300), manifest(BOB, "old", 100)],
      { ...options, followees: new Set([BOB]) },
    );
    expect(ids(entries)).toEqual(["old", "new"]);
    expect(entries[0]?.followed).toBe(true);
  });

  it("題名・説明・種類のすべての言葉を含むものに絞る", () => {
    const entries = nappletDirectory(
      [
        manifest(ALICE, "chrono", 100, [
          ["title", "Chronofeed"],
          ["z", "note"],
        ]),
        manifest(
          BOB,
          "duck",
          200,
          [["z", "game"]],
          "An endless voxel adventure",
        ),
      ],
      { ...options, query: "VOXEL game" },
    );
    expect(ids(entries)).toEqual(["duck"]);
  });

  // NIP-5D: > Clients MUST inspect the complete `R` set locally
  it("必須の機能のうち渡せないものを挙げ、動くものだけにも絞れる", () => {
    const events = [
      manifest(ALICE, "ok", 100, [
        ["R", "relay"],
        ["O", "upload"],
      ]),
      manifest(BOB, "needs-mesh", 200, [
        ["R", "relay"],
        ["R", "mesh"],
      ]),
    ];
    expect(nappletDirectory(events, options)[0]?.unsupported).toEqual(["mesh"]);
    expect(
      ids(nappletDirectory(events, { ...options, compatibleOnly: true })),
    ).toEqual(["ok"]);
  });

  it("読めないマニフェストと、名前付きでない napplet は出さない", () => {
    const broken = {
      ...manifest(ALICE, "broken", 100),
      tags: [["d", "broken"]],
    };
    const root = { ...manifest(BOB, "root", 200), kind: 15129 };
    expect(nappletDirectory([broken, root], options)).toEqual([]);
  });
});

describe("installedDirectory", () => {
  it("入れた順に並べ、マニフェストが届いていないものも残す", () => {
    const installed = [
      { pubkey: BOB, identifier: "missing", installedAt: 300 },
      { pubkey: ALICE, identifier: "feed", installedAt: 200 },
    ];
    const rows = installedDirectory(
      [manifest(ALICE, "feed", 100), manifest(ALICE, "feed", 300)],
      installed,
      { supported: options.supported, followees: new Set() },
    );
    expect(rows.map((row) => row.applet.identifier)).toEqual([
      "missing",
      "feed",
    ]);
    expect(rows[0]?.entry).toBeUndefined();
    expect(rows[1]?.entry?.manifest.createdAt).toBe(300);
  });

  it("探す一覧には、インストール済みのものを出さない", () => {
    const entries = nappletDirectory(
      [manifest(ALICE, "feed", 100), manifest(BOB, "game", 200)],
      {
        ...options,
        installed: [{ pubkey: ALICE, identifier: "feed", installedAt: 1 }],
      },
    );
    expect(ids(entries)).toEqual(["game"]);
  });
});
