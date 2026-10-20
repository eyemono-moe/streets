import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNaddr } from "../nostr/nip19";
import {
  buildArticleColumn,
  buildThreadColumn,
  buildUserColumn,
} from "./column-presets";
import { intentForColumn, streetsIntentColumn } from "./intent-columns";

const PUBKEY = "a".repeat(64);
const EVENT = "b".repeat(64);

describe("streetsIntentColumn", () => {
  // NAP-INTENT の例: invoke("napplet:profile/open?pubkey=abc123...")
  it("人を開く依頼は、hex でも npub でもユーザーのカラムにする", () => {
    expect(
      streetsIntentColumn("napplet:profile/open", { pubkey: PUBKEY }),
    ).toEqual(buildUserColumn(PUBKEY));
    expect(
      streetsIntentColumn("napplet:profile/open", {
        npub: encodeBech32("npub", PUBKEY),
      }),
    ).toEqual(buildUserColumn(PUBKEY));
  });

  // NAP-INTENT の例: invoke("napplet:note/open", { payload: { target: { type: "event", id: "abc..." } } })
  it("投稿を開く依頼は、包んだ形でもスレッドのカラムにする", () => {
    expect(
      streetsIntentColumn("napplet:note/open", {
        target: { type: "event", id: EVENT },
      }),
    ).toEqual(buildThreadColumn(EVENT));
    expect(
      streetsIntentColumn("napplet:note/open", {
        event: `nostr:${encodeBech32("note", EVENT)}`,
      }),
    ).toEqual(buildThreadColumn(EVENT));
  });

  it("読めない中身や、開けない依頼は開かない", () => {
    expect(
      streetsIntentColumn("napplet:profile/open", { pubkey: "abc" }),
    ).toBeUndefined();
    expect(
      streetsIntentColumn("napplet:feed/open", { pubkey: PUBKEY }),
    ).toBeUndefined();
  });
});

describe("intentForColumn", () => {
  it("Streets で開くカラムを依頼の形にし、Streets で開き直せる", () => {
    for (const column of [
      buildUserColumn(PUBKEY),
      buildThreadColumn(EVENT),
      buildArticleColumn(PUBKEY, "post", ["wss://relay.example/"]),
    ]) {
      const intent = intentForColumn(column);
      expect(intent).toBeDefined();
      expect(
        intent && streetsIntentColumn(intent.convention, intent.payload),
      ).toEqual(column);
    }
  });

  it("記事は naddr で渡す", () => {
    expect(intentForColumn(buildArticleColumn(PUBKEY, "post"))).toEqual({
      archetype: "article",
      convention: "napplet:article/open",
      payload: {
        naddr: encodeNaddr({
          identifier: "post",
          pubkey: PUBKEY,
          eventKind: 30023,
        }),
      },
    });
  });
});
