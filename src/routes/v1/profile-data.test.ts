import { describe, expect, it } from "vitest";
import { parseProfileContent } from "./profile-data";

describe("parseProfileContent", () => {
  it("name / display_name / picture を取り出す", () => {
    // 捕まえる変異: NIP-24 の snake_case (`display_name`) を camelCase で
    // 読む。JSON のキーは snake_case なので、読み替えを外すと表示名が
    // 永久に undefined になる。
    const parsed = parseProfileContent(
      JSON.stringify({
        name: "alice",
        display_name: "Alice",
        picture: "https://example.com/a.png",
      }),
    );

    expect(parsed?.name).toBe("alice");
    expect(parsed?.displayName).toBe("Alice");
    expect(parsed?.picture).toBe("https://example.com/a.png");
  });

  it("JSON として壊れていれば undefined を返し、投げない", () => {
    // 捕まえる変異: try/catch を外す。kind:0 の content はリレー由来の
    // 任意文字列であり、投げるとカラム全体が落ちる。
    expect(() => parseProfileContent("{壊れている")).not.toThrow();
    expect(parseProfileContent("{壊れている")).toBeUndefined();
  });

  it("オブジェクトでない JSON は undefined", () => {
    // 捕まえる変異: typeof の判定を外す。`"文字列"` や `null` は
    // JSON.parse を通るが、その後の record 参照で落ちる。
    expect(parseProfileContent('"just a string"')).toBeUndefined();
    expect(parseProfileContent("null")).toBeUndefined();
  });

  it("about / banner / nip05 / website を取り出す", () => {
    // 捕まえる変異: 4 つのうちどれかを読まない (カードのその行が永久に出ない)
    const parsed = parseProfileContent(
      JSON.stringify({
        about: "自己紹介",
        banner: "https://example.com/banner.png",
        nip05: "alice@example.com",
        website: "https://example.com",
      }),
    );

    expect(parsed?.about).toBe("自己紹介");
    expect(parsed?.banner).toBe("https://example.com/banner.png");
    expect(parsed?.nip05).toBe("alice@example.com");
    expect(parsed?.website).toBe("https://example.com");
  });

  it("文字列でないフィールドは undefined", () => {
    // 捕まえる変異: typeof の判定を外して値をそのまま入れる。kind:0 は
    // リレー由来の任意の JSON であり、数値やオブジェクトが入っていると
    // <img src={{}}> のような描画へそのまま流れる。
    const parsed = parseProfileContent(
      JSON.stringify({
        about: 42,
        banner: { url: "x" },
        nip05: null,
        website: ["https://example.com"],
      }),
    );

    expect(parsed?.about).toBeUndefined();
    expect(parsed?.banner).toBeUndefined();
    expect(parsed?.nip05).toBeUndefined();
    expect(parsed?.website).toBeUndefined();
  });
});
