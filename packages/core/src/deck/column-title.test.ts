import { describe, expect, it } from "vitest";
import type { RelayUrl } from "../relay/relay-connection";
import {
  buildColumn,
  buildFolloweesColumn,
  buildUserColumn,
} from "./column-presets";
import { columnTitle } from "./column-title";
import { type ColumnDef, defaultDeck } from "./deck";

const PUBKEY = "a".repeat(64);

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("想定したカラムが作れなかった");
  return value;
};

describe("columnTitle", () => {
  it("人に紐づくカラムは、保存した npub ではなく人として返す", () => {
    const column = buildUserColumn(PUBKEY);
    expect(column.title).toMatch(/^@npub/);
    expect(columnTitle(column)).toEqual({ person: PUBKEY, suffix: "" });
    expect(columnTitle(buildFolloweesColumn(PUBKEY))).toEqual({
      person: PUBKEY,
      suffix: " のフォロー",
    });
  });

  it("種類で決まるカラムは、保存した題名を使わない", () => {
    const home: ColumnDef = {
      ...must(defaultDeck(PUBKEY).columns[0]),
      title: "変えた名前",
    };
    expect(columnTitle(home)).toEqual({ text: "ホーム" });
  });

  it("ハッシュタグ・検索・リレー全体は、条件から決める", () => {
    expect(columnTitle(must(buildColumn("hashtag", "#Nostr")))).toEqual({
      text: "#nostr",
    });
    expect(columnTitle(must(buildColumn("search", "ねこ")))).toEqual({
      text: "ねこ",
    });
    expect(columnTitle(must(buildColumn("global", "")))).toEqual({
      text: "グローバル",
    });
  });

  it("条件を直に書いたカラムは、足したときの題名を使う", () => {
    const mine = must(defaultDeck(PUBKEY).columns[1]);
    expect(columnTitle(mine)).toEqual({ text: "自分の投稿" });
    const custom: ColumnDef = {
      id: "x",
      title: "リレーの kind:7",
      source: {
        kind: "literal",
        filters: [{ kinds: [7], authors: [PUBKEY] }],
        relays: ["wss://a.example/" as RelayUrl],
      },
    };
    expect(columnTitle(custom)).toEqual({ text: "リレーの kind:7" });
  });
});
