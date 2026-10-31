import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { columnTitle } from "./column-kinds";
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
    expect(columnTitle(column)).toEqual({
      message: { key: "column.title.kind", args: { kind: 30_078 } },
    });
  });

  it("長文記事は読むカラムで開く", () => {
    expect(columnForEvent(event(30_023, [["d", "post"]])).source).toEqual({
      kind: "article",
      pubkey: PUBKEY,
      identifier: "post",
    });
  });

  it("アップレットは動かさず、情報のカラムで開く", () => {
    expect(columnForEvent(event(35_129, [["d", "app"]])).source).toEqual({
      kind: "napplet-info",
      pubkey: PUBKEY,
      identifier: "app",
    });
  });

  it("リレーセットは、入っているリレーのカラムで開く", () => {
    const column = columnForEvent(
      event(30_002, [
        ["d", "jp"],
        ["title", "日本語のリレー"],
        ["relay", "wss://yabu.me/"],
        ["relay", "wss://nos.lol/"],
      ]),
    );
    expect(column.title).toBe("日本語のリレー");
    expect(column.source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: ["wss://yabu.me/", "wss://nos.lol/"],
    });
  });

  it("リレーの入っていないリレーセットは、住所で開く", () => {
    expect(columnForEvent(event(30_002, [["d", "empty"]])).id).toBe(
      `address:30002:${PUBKEY}:empty`,
    );
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
