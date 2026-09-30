import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { columnForEvent } from "./open-event";

const PUBKEY = "a".repeat(64);

const event = (kind: number, tags: string[][] = []): NostrEvent => ({
  id: "b".repeat(64),
  pubkey: PUBKEY,
  created_at: 0,
  kind,
  tags,
  content: "",
  sig: "0".repeat(128),
});

describe("columnForEvent", () => {
  it("投稿はスレッドで開く", () => {
    expect(columnForEvent(event(1)).source).toEqual({
      kind: "thread",
      focus: "b".repeat(64),
    });
  });

  it("住所を持つものは、版の id ではなく住所で開く", () => {
    // 捕まえる変異: id で開き、記事が更新されると古い版を指したままになる
    const column = columnForEvent(event(30_023, [["d", "post"]]));
    expect(column.id).toBe(`address:30023:${PUBKEY}:post`);
    expect(column.title).toBe("長文記事");
  });

  it("`d` が無いものは住所で指せないので、スレッドで開く", () => {
    expect(columnForEvent(event(30_023)).source.kind).toBe("thread");
  });
});
