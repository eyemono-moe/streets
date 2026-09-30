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

  it("http(s) でない r は開ける先にしない", () => {
    expect(
      parseUserStatus(
        status("曲", [
          ["d", "music"],
          ["r", "spotify:search:Intergalatic"],
        ]),
        200,
      )?.link,
    ).toBeUndefined();
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
