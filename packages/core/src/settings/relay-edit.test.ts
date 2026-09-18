import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import type { RelayListEntry } from "../read/relay-list";
import type { RelayUrl } from "../relay/relay-connection";
import {
  type RelayEditEvent,
  type RelayEditState,
  allowsRelayOp,
  applyRelayOps,
  displayedRelays,
  emptyRelayEdit,
  parseRelayInput,
  relayEditTransition,
  relayLabel,
  relayOpsMutation,
} from "./relay-edit";

const A = "wss://a.example/" as RelayUrl;
const B = "wss://b.example/" as RelayUrl;
const C = "wss://c.example/" as RelayUrl;

const both = (url: RelayUrl): RelayListEntry => ({
  url,
  read: true,
  write: true,
});

const relayList = (tags: string[][], extra: string[][] = []): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 10002,
  tags: [...tags, ...extra],
  content: "",
  sig: "c".repeat(128),
});

const run = (...events: RelayEditEvent[]): RelayEditState =>
  events.reduce(relayEditTransition, emptyRelayEdit());

describe("applyRelayOps", () => {
  it("足したリレーは読み込みと書き込みの両方に使う", () => {
    expect(applyRelayOps([], [{ type: "add", url: A }])).toEqual([both(A)]);
  });

  it("同じリレーを 2 回足しても 1 本", () => {
    expect(applyRelayOps([both(A)], [{ type: "add", url: A }])).toEqual([
      both(A),
    ]);
  });

  it("使い方を変える・外す", () => {
    const next = applyRelayOps(
      [both(A), both(B), both(C)],
      [
        { type: "set-usage", url: A, read: true, write: false },
        { type: "remove", url: B },
      ],
    );
    expect(next).toEqual([{ url: A, read: true, write: false }, both(C)]);
  });

  it("読み込みも書き込みもしない、にはできない", () => {
    expect(
      applyRelayOps(
        [both(A), both(B)],
        [{ type: "set-usage", url: A, read: false, write: false }],
      ),
    ).toEqual([both(A), both(B)]);
  });

  it("最後の書き込み先は外せない", () => {
    const entries = [both(A), { url: B, read: true, write: false }];
    expect(allowsRelayOp(entries, { type: "remove", url: A })).toBe(false);
    expect(
      allowsRelayOp(entries, {
        type: "set-usage",
        url: A,
        read: true,
        write: false,
      }),
    ).toBe(false);
    expect(allowsRelayOp(entries, { type: "remove", url: B })).toBe(true);
  });

  it("もともと読み込み先が無い一覧でも、書き込みの操作はできる", () => {
    // 別のクライアントが書き込みだけの一覧を作っていても、触れなくならない。
    const entries = [
      { url: A, read: false, write: true },
      { url: B, read: false, write: true },
    ];
    expect(allowsRelayOp(entries, { type: "remove", url: A })).toBe(true);
  });
});

describe("relayOpsMutation", () => {
  it("取り直した最新の一覧へ当てる。別の端末で足したリレーは残る", () => {
    // 画面を開いたあとに別の端末で C が足された。こちらは B を外しただけ。
    const latest = relayList([
      ["r", A],
      ["r", B],
      ["r", C, "read"],
    ]);
    const draft = relayOpsMutation([{ type: "remove", url: B }])(latest);
    expect(draft.tags).toEqual([
      ["r", A],
      ["r", C, "read"],
    ]);
  });

  it("r 以外のタグは残す", () => {
    const latest = relayList([["r", A]], [["client", "other"]]);
    const draft = relayOpsMutation([{ type: "add", url: B }])(latest);
    expect(draft.tags).toEqual([
      ["r", A],
      ["r", B],
      ["client", "other"],
    ]);
  });

  it("まだ一覧が無ければ、足したものだけで作る", () => {
    const draft = relayOpsMutation([{ type: "add", url: A }])(undefined);
    expect(draft).toMatchObject({ kind: 10002, tags: [["r", A]] });
  });
});

describe("relayEditTransition", () => {
  it("書きかけは、待ちが明けると送る側へ移る", () => {
    const state = run(
      { type: "relays/edit", op: { type: "add", url: A } },
      { type: "relays/flush" },
    );
    expect(state).toEqual({ pending: [], saving: [{ type: "add", url: A }] });
  });

  it("送っている途中は次を送らず、書きかけとして残す", () => {
    const state = run(
      { type: "relays/edit", op: { type: "add", url: A } },
      { type: "relays/flush" },
      { type: "relays/edit", op: { type: "add", url: B } },
      { type: "relays/flush" },
    );
    expect(state).toEqual({
      pending: [{ type: "add", url: B }],
      saving: [{ type: "add", url: A }],
    });
  });

  it("送れたら送った分を忘れ、送れなくても忘れる（画面は保存済みに戻る）", () => {
    const sending = run(
      { type: "relays/edit", op: { type: "add", url: A } },
      { type: "relays/flush" },
    );
    expect(
      relayEditTransition(sending, { type: "relays/saved" }).saving,
    ).toEqual([]);
    expect(
      relayEditTransition(sending, { type: "relays/failed" }).saving,
    ).toEqual([]);
  });

  it("送る側へ移すとき、書きかけと同じ配列を使い回さない", () => {
    const before = run({ type: "relays/edit", op: { type: "add", url: A } });
    const after = relayEditTransition(before, { type: "relays/flush" });
    expect(after.saving).not.toBe(before.pending);
  });

  it("書きかけが無ければ、明けても何もしない", () => {
    const state = emptyRelayEdit();
    expect(relayEditTransition(state, { type: "relays/flush" })).toBe(state);
  });

  it("画面には、送っている途中と書きかけの両方を当てて出す", () => {
    const state = run(
      { type: "relays/edit", op: { type: "add", url: B } },
      { type: "relays/flush" },
      { type: "relays/edit", op: { type: "remove", url: A } },
    );
    expect(displayedRelays([both(A)], state)).toEqual([both(B)]);
  });

  it("初期状態は呼ぶたびに別のオブジェクトになる", () => {
    expect(emptyRelayEdit()).not.toBe(emptyRelayEdit());
  });
});

describe("parseRelayInput", () => {
  it("wss:// を省いても補う", () => {
    expect(parseRelayInput("nos.lol", [])).toEqual({
      ok: true,
      url: "wss://nos.lol/",
    });
  });

  it("空・スキームだけは入力を促す", () => {
    expect(parseRelayInput("  ", []).ok).toBe(false);
    expect(parseRelayInput("wss://", []).ok).toBe(false);
  });

  it("websocket でない URL は断る", () => {
    expect(parseRelayInput("https://nos.lol", [])).toMatchObject({ ok: false });
  });

  it("もう入っているリレーは断る（書き方が違っても同じものとみなす）", () => {
    expect(parseRelayInput("WSS://A.example", [both(A)])).toMatchObject({
      ok: false,
      message: "このリレーはもう入っています",
    });
  });
});

describe("relayLabel", () => {
  it("末尾の / を見せない", () => {
    expect(relayLabel(A)).toBe("wss://a.example");
  });
});
