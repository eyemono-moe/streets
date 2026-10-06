import { describe, expect, it } from "vite-plus/test";
import {
  loadReadRoutingMode,
  readRoutingFor,
  saveReadRoutingMode,
} from "./read-routing-setting";

const fallback = ["wss://fallback/"];

describe("読み取り先の設定", () => {
  it("未保存と読めない値は Outbox", () => {
    expect(loadReadRoutingMode(null)).toBe("outbox");
    expect(loadReadRoutingMode("???")).toBe("outbox");
    expect(loadReadRoutingMode(saveReadRoutingMode("direct"))).toBe("direct");
  });

  it("Outbox は自分の読み込みリレーを優先先として持つ", () => {
    expect(readRoutingFor("outbox", { phase: "loading" }, fallback)).toEqual({
      mode: "outbox",
    });
    expect(
      readRoutingFor(
        "outbox",
        {
          phase: "ready",
          entries: [
            { url: "wss://read/", read: true, write: false },
            { url: "wss://write/", read: false, write: true },
          ],
        },
        fallback,
      ),
    ).toEqual({ mode: "outbox", preferred: ["wss://read/"] });
  });

  it("direct は自分の読み込みリレーだけを読む", () => {
    expect(
      readRoutingFor(
        "direct",
        {
          phase: "ready",
          entries: [
            { url: "wss://read/", read: true, write: false },
            { url: "wss://write/", read: false, write: true },
            { url: "wss://both/", read: true, write: true },
          ],
        },
        fallback,
      ),
    ).toEqual({ mode: "direct", relays: ["wss://read/", "wss://both/"] });
  });

  it("一覧を取りに行っている間は 0 本で待つ", () => {
    expect(readRoutingFor("direct", { phase: "loading" }, fallback)).toEqual({
      mode: "direct",
      relays: [],
    });
  });

  it("一覧が無い・読み込みリレーが無いときは fallback を読む", () => {
    expect(readRoutingFor("direct", { phase: "missing" }, fallback)).toEqual({
      mode: "direct",
      relays: fallback,
    });
    expect(
      readRoutingFor(
        "direct",
        {
          phase: "ready",
          entries: [{ url: "wss://write/", read: false, write: true }],
        },
        fallback,
      ),
    ).toEqual({ mode: "direct", relays: fallback });
  });
});
