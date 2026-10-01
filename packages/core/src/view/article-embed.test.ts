import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNaddr, encodeNevent } from "../nostr/nip19";
import { articleEmbedOf } from "./article-embed";

const ID = "a".repeat(64);
const PUBKEY = "b".repeat(64);

describe("articleEmbedOf", () => {
  it("参照 1 つだけの段落は埋め込みにする（nostr: は付いていてもいなくてもよい）", () => {
    const note = encodeBech32("note", ID);
    expect(articleEmbedOf(`nostr:${note}`)).toEqual({ form: "id", id: ID });
    expect(articleEmbedOf(`  ${note}\n`)).toEqual({ form: "id", id: ID });
  });

  it("nevent と naddr は、リレーの手がかりも持っていく", () => {
    const nevent = encodeNevent({ id: ID, relays: ["wss://r.example/"] });
    expect(articleEmbedOf(`nostr:${nevent}`)).toEqual({
      form: "id",
      id: ID,
      relay: "wss://r.example/",
    });
    const naddr = encodeNaddr({
      identifier: "post",
      pubkey: PUBKEY,
      eventKind: 30_023,
    });
    expect(articleEmbedOf(`nostr:${naddr}`)).toEqual({
      form: "address",
      address: `30023:${PUBKEY}:post`,
    });
  });

  it("文の途中の参照と、人への参照は埋め込みにしない", () => {
    // 捕まえる変異: 文の中の参照までカードにし、本文が途中で切れる
    const note = encodeBech32("note", ID);
    expect(articleEmbedOf(`前に書いた nostr:${note} を見て`)).toBeUndefined();
    expect(
      articleEmbedOf(`nostr:${encodeBech32("npub", PUBKEY)}`),
    ).toBeUndefined();
  });
});
