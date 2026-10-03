import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { columnForEvent, columnForNoteRef } from "./open-event";

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
    // 捕まえる変異: id で開き、書き直されると古い版を指したままになる
    const column = columnForEvent(event(30_078, [["d", "app"]]));
    expect(column.id).toBe(`address:30078:${PUBKEY}:app`);
    expect(column.title).toBe("アプリの設定");
  });

  it("長文記事は読むカラムで開く", () => {
    expect(columnForEvent(event(30_023, [["d", "post"]])).source).toEqual({
      kind: "article",
      pubkey: PUBKEY,
      identifier: "post",
    });
  });

  it("`d` が無いものは住所で指せないので、スレッドで開く", () => {
    expect(columnForEvent(event(30_023)).source.kind).toBe("thread");
  });
});

describe("columnForNoteRef", () => {
  it("nevent が運ぶリレーを、スレッドに持っていく", () => {
    const ref = {
      kind: "nevent" as const,
      id: "b".repeat(64),
      relays: ["wss://hint.example"],
    };
    // 捕まえる変異: id だけで開く（ヒントのリレーにしか無い投稿が取れない）
    const column = columnForNoteRef(ref);
    expect(column.source).toEqual({ kind: "thread", focus: "b".repeat(64) });
    expect(column.knownRelays).toEqual(["wss://hint.example/"]);
  });
});
