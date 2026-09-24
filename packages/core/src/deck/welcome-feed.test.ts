import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import {
  DEFAULT_WELCOME_RELAYS,
  showsOnWelcome,
  welcomeColumn,
  welcomeRelays,
} from "./welcome-feed";

const note = (tags: string[][]): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1,
    kind: 1,
    tags,
    content: "",
    sig: "",
  }) as NostrEvent;

describe("welcomeRelays", () => {
  it("指定が無ければ既定のリレーを使う", () => {
    expect(welcomeRelays(undefined)).toEqual(DEFAULT_WELCOME_RELAYS);
    expect(welcomeRelays("")).toEqual(DEFAULT_WELCOME_RELAYS);
  });

  it("カンマと空白で区切り、正規化して重複を除く", () => {
    expect(
      welcomeRelays("wss://A.example, wss://b.example/\nwss://a.example/"),
    ).toEqual(["wss://a.example/", "wss://b.example/"]);
  });

  it("読めない指定しか無ければ既定に戻す", () => {
    // 捕まえる変異: 空配列をそのまま返す（0 本の明示指定になり、入口に何も流れない）
    expect(welcomeRelays("https://a.example nope")).toEqual(
      DEFAULT_WELCOME_RELAYS,
    );
  });

  it("本数に上限を切る", () => {
    // 明示リレーは接続の予算で落とされないため
    expect(
      welcomeRelays(
        "wss://a.example wss://b.example wss://c.example wss://d.example",
      ),
    ).toHaveLength(3);
  });
});

describe("welcomeColumn", () => {
  it("指定したリレーの kind:1 だけを流す", () => {
    expect(welcomeColumn(["wss://a.example/"]).source).toEqual({
      kind: "literal",
      filters: [{ kinds: [1] }],
      relays: ["wss://a.example/"],
    });
  });
});

describe("showsOnWelcome", () => {
  it("注意書きの付いた投稿を出さない", () => {
    expect(showsOnWelcome(note([["content-warning", "nsfw"]]))).toBe(false);
    expect(showsOnWelcome(note([["content-warning"]]))).toBe(false);
    expect(showsOnWelcome(note([["t", "nostr"]]))).toBe(true);
  });
});
