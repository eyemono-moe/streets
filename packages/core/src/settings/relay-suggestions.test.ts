import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "../relay/relay-connection";
import { relaySuggestions } from "./relay-suggestions";

const url = (host: string) => `wss://${host}/` as RelayUrl;

describe("relaySuggestions", () => {
  const account = [
    { url: url("yabu.me"), read: true, write: true },
    { url: url("relay-jp.example"), read: true, write: false },
  ];
  const followeeWriteRelays = [
    [url("nos.lol"), url("yabu.me")],
    [url("nos.lol"), url("nos.lol")],
    [url("relay.damus.io")],
  ];

  it("自分のリレーを先に、フォローしている人のリレーを使っている人の多い順に出す", () => {
    const result = relaySuggestions({
      account,
      followeeWriteRelays,
      selected: [url("yabu.me")],
      query: "",
    });
    expect(
      result.map((item) => [item.group, item.url, item.detail, item.added]),
    ).toEqual([
      ["account", url("yabu.me"), "読み書き", true],
      ["account", url("relay-jp.example"), "読み込み", false],
      // 捕まえる変異: 同じ人のリレーを重ねて数える（2 人が 3 人になる）
      ["followees", url("nos.lol"), "2 人", false],
      ["followees", url("relay.damus.io"), "1 人", false],
    ]);
  });

  it("打った文字で絞り込む（wss:// や大文字は無視する）", () => {
    expect(
      relaySuggestions({
        account,
        followeeWriteRelays,
        selected: [],
        query: "WSS://NOS",
      }).map((item) => item.url),
    ).toEqual([url("nos.lol")]);
  });

  it("フォローしている人のリレーは上限で切る", () => {
    // 捕まえる変異: 上限を切らない（フォローが多いと候補が数百になる）
    expect(
      relaySuggestions({
        account: [],
        followeeWriteRelays: Array.from({ length: 30 }, (_, i) => [
          url(`r${i}.example`),
        ]),
        selected: [],
        query: "",
      }),
    ).toHaveLength(10);
  });
});
