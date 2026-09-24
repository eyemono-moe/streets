import { describe, expect, it } from "vite-plus/test";
import { embedOf } from "./embed";

const ID = "dQw4w9WgXcQ";

describe("embedOf", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&list=PL123`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
  ])("%s は YouTube", (url) => {
    expect(embedOf(url)).toEqual({ kind: "youtube", id: ID });
  });

  it("再生位置を秒で持つ", () => {
    expect(embedOf(`https://youtu.be/${ID}?t=90`)).toEqual({
      kind: "youtube",
      id: ID,
      start: 90,
    });
    expect(embedOf(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toEqual({
      kind: "youtube",
      id: ID,
      start: 90,
    });
    expect(embedOf(`https://www.youtube.com/watch?v=${ID}&t=abc`)).toEqual({
      kind: "youtube",
      id: ID,
    });
  });

  it.each([
    ["https://www.youtube.com/@channel"],
    ["https://www.youtube.com/watch?v=short"],
    [`https://www.youtube.com/playlist?list=${ID}`],
    [`https://evil.example/watch?v=${ID}`],
  ])("%s は埋め込みにしない", (url) => {
    // 捕まえる変異: ID の形を確かめない（任意の文字列を iframe の URL に入れる）
    expect(embedOf(url)).toBeUndefined();
  });

  it.each([
    ["https://x.com/jack/status/20"],
    ["https://twitter.com/jack/status/20"],
    ["https://mobile.twitter.com/jack/status/20?s=21"],
    ["https://x.com/jack/status/20/photo/1"],
    ["https://x.com/i/web/status/20"],
  ])("%s は X の投稿", (url) => {
    expect(embedOf(url)).toEqual({ kind: "x", id: "20" });
  });

  it.each([
    ["https://x.com/jack"],
    ["https://x.com/jack/status/abc"],
    ["https://x.com/home"],
    ["https://notx.com/jack/status/20"],
  ])("%s は X の投稿ではない", (url) => {
    expect(embedOf(url)).toBeUndefined();
  });
});
