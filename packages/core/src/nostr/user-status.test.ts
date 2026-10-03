import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { parseUserStatus } from "./user-status";

const status = (content: string, tags: string[][]): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 100,
  kind: 30_315,
  tags,
  content,
  sig: "0".repeat(128),
});

describe("parseUserStatus", () => {
  it("聴いている曲を、期限と開ける先つきで読む", () => {
    expect(
      parseUserStatus(
        status("Black Dog / Led Zeppelin", [
          ["d", "music"],
          ["r", "https://songwhip.com/led-zeppelin/black-dog"],
          ["expiration", "500"],
        ]),
        200,
      ),
    ).toMatchObject({
      type: "music",
      content: "Black Dog / Led Zeppelin",
      link: { type: "url", url: "https://songwhip.com/led-zeppelin/black-dog" },
      expiresAt: 500,
    });
  });

  it("期限が過ぎたもの・空のもの（消した）は出さない", () => {
    // 捕まえる変異: 期限を見ず、とうに終わった曲をずっと出す
    expect(
      parseUserStatus(
        status("曲", [
          ["d", "music"],
          ["expiration", "150"],
        ]),
        200,
      ),
    ).toBeUndefined();
    expect(
      parseUserStatus(status("  ", [["d", "general"]]), 200),
    ).toBeUndefined();
  });

  it("general と music 以外の種類は出さない", () => {
    // 実際に流れている presence や、壊れた d（general,expiration=…）
    expect(
      parseUserStatus(status('{"lastSeen":1}', [["d", "presence"]]), 200),
    ).toBeUndefined();
    expect(
      parseUserStatus(
        status("ぽかぽか", [["d", "general,expiration=1790657400"]]),
        200,
      ),
    ).toBeUndefined();
  });

  it("spotify: の r は open.spotify.com に置き換えて開ける先にする", () => {
    const link = (r: string) =>
      parseUserStatus(
        status("曲", [
          ["d", "music"],
          ["r", r],
        ]),
        200,
      )?.link;
    expect(link("spotify:search:Gin%20and%20Juice%20-%20Snoop%20Dogg")).toEqual(
      {
        type: "url",
        url: "https://open.spotify.com/search/Gin%20and%20Juice%20-%20Snoop%20Dogg",
      },
    );
    expect(link("spotify:track:7BY2uOpNy5DyST14WrLS5b")).toEqual({
      type: "url",
      url: "https://open.spotify.com/track/7BY2uOpNy5DyST14WrLS5b",
    });
    // 捕まえる変異: 検索語の `:` まで区切って、別の場所を開く
    expect(link("spotify:search:Re:Zero")).toEqual({
      type: "url",
      url: "https://open.spotify.com/search/Re:Zero",
    });
    expect(link("spotify:search:AC/DC")).toEqual({
      type: "url",
      url: "https://open.spotify.com/search/AC%2FDC",
    });
  });

  it("http(s) にも spotify: の形にもならない r は開ける先にしない", () => {
    const link = (r: string) =>
      parseUserStatus(
        status("曲", [
          ["d", "music"],
          ["r", r],
        ]),
        200,
      )?.link;
    expect(link("javascript:alert(1)")).toBeUndefined();
    expect(link("spotify:search:")).toBeUndefined();
    expect(link("spotify:track:../../evil")).toBeUndefined();
  });

  it("投稿を指す e を開ける先にする", () => {
    expect(
      parseUserStatus(
        status("旅行中", [
          ["d", "general"],
          ["e", "b".repeat(64)],
        ]),
        200,
      )?.link,
    ).toEqual({ type: "event", id: "b".repeat(64) });
  });
});
