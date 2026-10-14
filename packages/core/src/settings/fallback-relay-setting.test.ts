import { describe, expect, it } from "vite-plus/test";
import { FALLBACK_RELAYS } from "../read/default-relays";
import {
  MAX_FALLBACK_RELAYS,
  fallbackRelaysInUse,
  loadFallbackRelays,
  saveFallbackRelays,
} from "./fallback-relay-setting";

describe("既定のリレーの設定", () => {
  it("未保存と読めない値は空", () => {
    for (const raw of [null, "", "{", "{}", '"wss://a/"', "[1, null]"]) {
      expect(loadFallbackRelays(raw)).toEqual([]);
    }
  });

  it("保存したリレーを、正規化して重複を除いて読み戻す", () => {
    expect(
      loadFallbackRelays(
        saveFallbackRelays(["wss://a.example/", "wss://b.example/"]),
      ),
    ).toEqual(["wss://a.example/", "wss://b.example/"]);
    expect(
      loadFallbackRelays(
        JSON.stringify(["wss://A.example", "wss://a.example/", "ftp://x"]),
      ),
    ).toEqual(["wss://a.example/"]);
  });

  it("上限を超えた分は捨てる", () => {
    const many = Array.from(
      { length: MAX_FALLBACK_RELAYS + 2 },
      (_, index) => `wss://r${index}.example/`,
    );
    expect(loadFallbackRelays(JSON.stringify(many))).toHaveLength(
      MAX_FALLBACK_RELAYS,
    );
    expect(JSON.parse(saveFallbackRelays(many))).toHaveLength(
      MAX_FALLBACK_RELAYS,
    );
  });

  it("1 本も指定していなければ、Streets が決めたリレーを使う", () => {
    expect(fallbackRelaysInUse([])).toEqual(FALLBACK_RELAYS);
    expect(fallbackRelaysInUse(["wss://mine.example/"])).toEqual([
      "wss://mine.example/",
    ]);
  });
});
