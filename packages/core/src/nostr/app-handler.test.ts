import { describe, expect, it } from "vite-plus/test";
import {
  clientOf,
  handlerUrlFor,
  httpUrlOf,
  parseAppHandler,
} from "./app-handler";
import type { NostrEvent } from "./event";

const PUBKEY = "a".repeat(64);

const event = (partial: Partial<NostrEvent>): NostrEvent => ({
  id: "b".repeat(64),
  pubkey: "c".repeat(64),
  created_at: 0,
  kind: 1,
  tags: [],
  content: "",
  sig: "",
  ...partial,
});

describe("clientOf", () => {
  it("名前と、kind:31990 の座標とリレーを読む", () => {
    const note = event({
      tags: [["client", "Foo", `31990:${PUBKEY}:foo`, "wss://relay.example"]],
    });
    expect(clientOf(note)).toEqual({
      name: "Foo",
      handler: { pubkey: PUBKEY, identifier: "foo" },
      relay: "wss://relay.example",
    });
  });

  it("名前だけのタグは名前だけを返す", () => {
    expect(clientOf(event({ tags: [["client", "Primal iOS"]] }))).toEqual({
      name: "Primal iOS",
    });
  });

  it("座標が kind:31990 でなければ、名前だけにする", () => {
    const note = event({ tags: [["client", "Foo", `30023:${PUBKEY}:foo`]] });
    expect(clientOf(note)).toEqual({ name: "Foo" });
  });

  it("タグが無い・名前が空なら何も返さない", () => {
    expect(clientOf(event({}))).toBeUndefined();
    expect(clientOf(event({ tags: [["client", "  "]] }))).toBeUndefined();
  });
});

describe("httpUrlOf", () => {
  it("http(s) だけを通す", () => {
    expect(httpUrlOf("https://example.com")).toBe("https://example.com/");
    expect(httpUrlOf("javascript:alert(1)")).toBeUndefined();
    expect(httpUrlOf("not a url")).toBeUndefined();
  });
});

describe("parseAppHandler", () => {
  it("説明と web タグを読み、http(s) でないサイトは捨てる", () => {
    const handler = parseAppHandler(
      event({
        kind: 31990,
        content: JSON.stringify({
          name: "Foo",
          picture: "https://example.com/icon.png",
          website: "javascript:alert(1)",
        }),
        tags: [
          ["d", "foo"],
          ["web", "https://foo.example/e/<bech32>", "nevent"],
          ["web", "https://foo.example/no-placeholder", "note"],
        ],
      }),
    );
    expect(handler.profile?.name).toBe("Foo");
    expect(handler.website).toBeUndefined();
    expect(handler.web).toEqual([
      { template: "https://foo.example/e/<bech32>", entity: "nevent" },
    ]);
  });

  it("content が空なら説明を持たない（出した人の kind:0 を見る）", () => {
    expect(parseAppHandler(event({ kind: 31990 })).profile).toBeUndefined();
  });
});

describe("handlerUrlFor", () => {
  const note = event({});

  it("nevent を受けるものを先に使う", () => {
    const url = handlerUrlFor(
      {
        web: [
          { template: "https://foo.example/n/<bech32>", entity: "note" },
          { template: "https://foo.example/e/<bech32>", entity: "nevent" },
        ],
      },
      note,
    );
    expect(url).toMatch(/^https:\/\/foo\.example\/e\/nevent1/);
  });

  it("nevent が無ければ note、それも無ければ種類を問わないものを使う", () => {
    expect(
      handlerUrlFor(
        {
          web: [{ template: "https://foo.example/n/<bech32>", entity: "note" }],
        },
        note,
      ),
    ).toMatch(/^https:\/\/foo\.example\/n\/note1/);
    expect(
      handlerUrlFor(
        { web: [{ template: "https://foo.example/<bech32>" }] },
        note,
      ),
    ).toMatch(/^https:\/\/foo\.example\/nevent1/);
  });

  it("人しか開けないアプリや、http(s) でない行き先では開かない", () => {
    expect(
      handlerUrlFor(
        {
          web: [{ template: "https://foo.example/p/<bech32>", entity: "npub" }],
        },
        note,
      ),
    ).toBeUndefined();
    expect(
      handlerUrlFor(
        { web: [{ template: "foo://<bech32>", entity: "nevent" }] },
        note,
      ),
    ).toBeUndefined();
  });
});
