import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { createDeletionRequests } from "./deletion-requests";
import { createFakeClock } from "./fake-clock";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const RELAY_1 = "wss://one.example" as RelayUrl;
const RELAY_2 = "wss://two.example" as RelayUrl;

const event = (
  id: string,
  overrides: Partial<Pick<NostrEvent, "pubkey" | "kind" | "tags">> = {},
): NostrEvent => ({
  id: id.repeat(64),
  pubkey: overrides.pubkey ?? ALICE,
  created_at: 1_700_000_000,
  kind: overrides.kind ?? 1,
  tags: overrides.tags ?? [],
  content: "",
  sig: "0".repeat(128),
});

const setup = (seen: Record<string, RelayUrl[]> = {}) => {
  const clock = createFakeClock();
  const calls: { filters: RelayFilter[]; relays?: RelayUrl[] }[] = [];
  const requests = createDeletionRequests({
    store: { seenRelays: (id) => seen[id] ?? [] },
    manager: {
      async fetchOnce(filters, options) {
        calls.push({ filters, relays: options?.relays });
      },
    },
    scheduler: clock,
  });
  return { clock, calls, requests };
};

describe("createDeletionRequests", () => {
  it("窓の間に描いた投稿を、取ったリレーごとに 1 本へまとめる", () => {
    // 捕まえる変異: 投稿ごとに REQ を送る / 既定のリレーへ送る（投稿を取ったリレーを見ない）
    const first = event("1");
    const second = event("2", { pubkey: BOB });
    const { clock, calls, requests } = setup({
      [first.id]: [RELAY_1],
      [second.id]: [RELAY_1, RELAY_2],
    });
    requests.request(first);
    requests.request(second);
    clock.advance(200);

    expect(calls).toEqual([
      {
        filters: [
          { kinds: [5], authors: [ALICE, BOB], "#e": [first.id, second.id] },
        ],
        relays: [RELAY_1],
      },
      {
        filters: [{ kinds: [5], authors: [BOB], "#e": [second.id] }],
        relays: [RELAY_2],
      },
    ]);
  });

  it("取ったリレーが分からない投稿は既定のリレーへ聞く", () => {
    // 捕まえる変異: seenRelays が空なら何もしない（書いたばかりの投稿を別端末で消しても残る）
    const { clock, calls, requests } = setup();
    const note = event("1");
    requests.request(note);
    clock.advance(200);
    expect(calls).toEqual([
      {
        filters: [{ kinds: [5], authors: [ALICE], "#e": [note.id] }],
        relays: undefined,
      },
    ]);
  });

  it("置き換えられる投稿は座標でも探す", () => {
    // 捕まえる変異: `#e` だけで探す（`a` だけを持つ削除依頼を取りこぼす）
    const article = event("3", { kind: 30023, tags: [["d", "post"]] });
    const { clock, calls, requests } = setup({ [article.id]: [RELAY_1] });
    requests.request(article);
    clock.advance(200);
    expect(calls[0]?.filters).toEqual([
      { kinds: [5], authors: [ALICE], "#e": [article.id] },
      { kinds: [5], authors: [ALICE], "#a": [`30023:${ALICE}:post`] },
    ]);
  });

  it("同じ投稿は 2 度取りにいかない", () => {
    // 捕まえる変異: 要求済みを覚えない（スクロールで行が作り直されるたびに REQ が飛ぶ）
    const note = event("1");
    const { clock, calls, requests } = setup({ [note.id]: [RELAY_1] });
    requests.request(note);
    clock.advance(200);
    requests.request(note);
    clock.advance(200);
    expect(calls).toHaveLength(1);
  });

  it("削除依頼そのものには削除依頼を探さない", () => {
    const { clock, calls, requests } = setup();
    requests.request(event("4", { kind: 5 }));
    clock.advance(200);
    expect(calls).toHaveLength(0);
  });

  it("id の無い書きかけのプレビューは取りにいかない", () => {
    // 捕まえる変異: id を確かめない（投稿欄を開くたびに `#e: [""]` を送る）
    const { clock, calls, requests } = setup();
    requests.request({ ...event("1"), id: "" });
    clock.advance(200);
    expect(calls).toHaveLength(0);
  });

  it("dispose の後は送らない", () => {
    // 捕まえる変異: dispose がタイマーを止めない（ログアウト後に古い読み取り層が REQ を送る）
    const { clock, calls, requests } = setup();
    requests.request(event("1"));
    requests.dispose();
    clock.advance(200);
    requests.request(event("2"));
    clock.advance(200);
    expect(calls).toHaveLength(0);
    expect(clock.pendingCount).toBe(0);
  });
});
