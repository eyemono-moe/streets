import { describe, expect, it, vi } from "vitest";
import type { EventDraft } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { SignerUnavailableError } from "../../core/signer/signer";
import { WriteFailedError } from "../../core/write/writer";
import { createEventActions, eventActionErrorMessage } from "./event-actions";

const target = (kind = 1): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1,
  kind,
  tags: [],
  content: "target",
  sig: "c".repeat(128),
});

const setup = (relays: string[]) => {
  const drafts: EventDraft[] = [];
  const publish = vi.fn(async (draft: EventDraft) => {
    drafts.push(draft);
    return {
      event: target(draft.kind),
      accepted: [] as RelayUrl[],
      rejected: [],
    };
  });
  return {
    drafts,
    publish,
    actions: createEventActions({
      writer: { publish },
      store: { seenRelays: () => relays },
    }),
  };
};

describe("createEventActions", () => {
  it("返信とリポストに最初の実リレーだけを正規化して付ける", async () => {
    const { actions, drafts } = setup([
      "local",
      "embedded",
      "https://not-a-relay.example",
      "wss://Relay.Example/inbox?ignored=1",
      "wss://other.example/",
    ]);
    const event = target();

    await actions.reply(event, "reply");
    await actions.repost(event);

    // 捕まえる変異: seenRelays の先頭を無検証で使う。楽観挿入の印 `local`
    // が NIP-10 / NIP-18 のリレーヒントとして外へ送られる。
    expect(drafts[0]?.tags[0]).toEqual([
      "e",
      event.id,
      "wss://relay.example/inbox",
      "root",
      event.pubkey,
    ]);
    expect(drafts[1]?.tags[0]).toEqual([
      "e",
      event.id,
      "wss://relay.example/inbox",
      "",
      event.pubkey,
    ]);
  });

  it("Like は content + の kind:7 を送る", async () => {
    const { actions, drafts } = setup([]);
    const event = target();

    await actions.like(event);

    // 捕まえる変異: Like を本文 `-` や空文字で送る。
    expect(drafts).toEqual([
      {
        kind: 7,
        content: "+",
        tags: [
          ["e", event.id],
          ["p", event.pubkey],
          ["k", "1"],
        ],
      },
    ]);
  });

  it("kind:1 以外は不正な kind:6 として送らない", async () => {
    const { actions, publish } = setup([]);

    await expect(actions.repost(target(30023))).rejects.toThrow(
      "このイベントはリポストできません",
    );
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("eventActionErrorMessage", () => {
  it("再試行判断に必要な失敗種別を区別する", () => {
    expect(
      eventActionErrorMessage(
        new WriteFailedError([
          { relay: "wss://one/" as RelayUrl, reason: "rejected" },
        ]),
      ),
    ).toContain("1本が拒否");
    expect(eventActionErrorMessage(new SignerUnavailableError())).toContain(
      "ログインし直して",
    );
    expect(eventActionErrorMessage(new Error("拒否しました"))).toContain(
      "拒否しました",
    );
  });
});
