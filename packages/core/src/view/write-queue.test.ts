import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "../relay/relay-connection";
import type { RelayProgress, WriteProgress } from "../write/write-progress";
import {
  type WriteQueueEvent,
  type WriteQueueState,
  emptyWriteQueue,
  isWriteFinished,
  shouldShowWriteQueue,
  summarizeWriteQueue,
  writeQueueTransition,
} from "./write-queue";

const A = "wss://a.example/" as RelayUrl;
const B = "wss://b.example/" as RelayUrl;

const run = (...events: WriteQueueEvent[]): WriteQueueState =>
  events.reduce(writeQueueTransition, emptyWriteQueue());

const start = (
  id: string,
  label = "投稿",
  options: { quiet?: boolean; at?: number } = {},
): WriteQueueEvent => ({
  type: "write-queue/start",
  id,
  label,
  quiet: options.quiet ?? false,
  at: options.at ?? 0,
});

const sending = (
  id: string,
  a: RelayProgress["state"],
  b: RelayProgress["state"],
): WriteQueueEvent => {
  const progress: WriteProgress = {
    phase: "sending",
    relays: [
      a === "rejected"
        ? { relay: A, state: a, reason: "blocked" }
        : { relay: A, state: a },
      b === "rejected"
        ? { relay: B, state: b, reason: "blocked" }
        : { relay: B, state: b },
    ],
  };
  return { type: "write-queue/progress", id, progress };
};

const returned = (id: string): WriteQueueEvent => ({
  type: "write-queue/returned",
  id,
});

const writeOf = (state: WriteQueueState, id: string) => {
  const write = state.writes.find((entry) => entry.id === id);
  if (!write) throw new Error(`no write ${id}`);
  return write;
};

describe("writeQueueTransition", () => {
  it("書き込みを積んだ順に持つ", () => {
    const state = run(start("1", "投稿"), start("2", "リアクション"));
    expect(state.writes.map((write) => write.label)).toEqual([
      "投稿",
      "リアクション",
    ]);
  });

  it("保存できた、知らせる書き込みの名前を、列が空になるまで覚える", () => {
    const state = run(
      start("1", "ステータス"),
      start("2", "リアクション", { quiet: true }),
      { type: "write-queue/finished", id: "1" },
      { type: "write-queue/finished", id: "2" },
    );
    expect(state.writes).toEqual([]);
    expect(state.saved).toEqual(["ステータス"]);
  });

  it("断ったリレーがあった書き込みは、保存できた一覧に数えない", () => {
    // 理由を添えた知らせを別に出すので、「保存しました」に混ぜると 2 回知らせる。
    const state = run(
      start("1", "ステータス"),
      sending("1", "accepted", "rejected"),
      {
        type: "write-queue/finished",
        id: "1",
      },
    );
    expect(state.saved).toEqual([]);
  });

  it("失敗した書き込みは列から外し、保存できた一覧にも数えない", () => {
    const state = run(start("1", "ステータス"), {
      type: "write-queue/failed",
      id: "1",
    });
    expect(state).toEqual(emptyWriteQueue());
  });

  it("知らせ終えたら、保存できた一覧を空にする", () => {
    const state = run(
      start("1", "ステータス"),
      { type: "write-queue/finished", id: "1" },
      { type: "write-queue/acknowledged" },
    );
    expect(state.saved).toEqual([]);
  });

  it("列から外した後に届いた進み具合は無視する", () => {
    const state = run(
      start("1"),
      { type: "write-queue/failed", id: "1" },
      sending("1", "accepted", "accepted"),
    );
    expect(state.writes).toEqual([]);
  });
});

describe("isWriteFinished", () => {
  it("1 本が受け取って返した後も、残りのリレーの結果が揃うまでは終えない", () => {
    const state = run(
      start("1"),
      sending("1", "accepted", "pending"),
      returned("1"),
    );
    expect(isWriteFinished(writeOf(state, "1"))).toBe(false);
  });

  it("返した後に全部の結果が揃ったら終える", () => {
    const state = run(
      start("1"),
      sending("1", "accepted", "pending"),
      returned("1"),
      sending("1", "accepted", "rejected"),
    );
    expect(isWriteFinished(writeOf(state, "1"))).toBe(true);
  });

  it("全部の結果が揃っていても、返す前は終えない", () => {
    const state = run(start("1"), sending("1", "accepted", "accepted"));
    expect(isWriteFinished(writeOf(state, "1"))).toBe(false);
  });
});

describe("shouldShowWriteQueue", () => {
  it("知らせる書き込みはすぐに出す", () => {
    const state = run(start("1", "ステータス", { at: 1000 }));
    expect(shouldShowWriteQueue(state, 1000, 1000)).toBe(true);
  });

  it("知らせない書き込みは、待つ時間が過ぎても残っているときだけ出す", () => {
    const state = run(start("1", "投稿", { quiet: true, at: 1000 }));
    expect(shouldShowWriteQueue(state, 1999, 1000)).toBe(false);
    expect(shouldShowWriteQueue(state, 2000, 1000)).toBe(true);
  });

  it("署名を待っている書き込みだけなら出さない", () => {
    // 署名器の承認待ちのトーストが同じ待ちを知らせている。
    const state = run(start("1", "ステータス"), {
      type: "write-queue/progress",
      id: "1",
      progress: { phase: "signing" },
    });
    expect(shouldShowWriteQueue(state, 0, 1000)).toBe(false);
  });
});

describe("summarizeWriteQueue", () => {
  it("送っている件数と、名前ごとの件数を出す", () => {
    const state = run(
      start("1", "投稿"),
      start("2", "リアクション"),
      start("3", "投稿"),
    );
    expect(summarizeWriteQueue(state)).toMatchObject({
      tone: "working",
      total: 3,
      labels: [
        { label: "投稿", count: 2 },
        { label: "リアクション", count: 1 },
      ],
    });
  });

  it("見出しの輪には、全部の書き込みのリレーの数を足して出す", () => {
    const state = run(
      start("1"),
      start("2"),
      sending("1", "accepted", "rejected"),
      sending("2", "accepted", "pending"),
    );
    expect(summarizeWriteQueue(state)).toMatchObject({
      counts: { done: 2, failed: 1, pending: 1 },
    });
  });

  it("種類ごとの輪には、その種類の書き込みのリレーの数だけを足す", () => {
    const state = run(
      start("1", "投稿"),
      start("2", "リアクション"),
      start("3", "投稿"),
      sending("1", "accepted", "pending"),
      sending("2", "pending", "pending"),
      sending("3", "accepted", "rejected"),
    );
    expect(summarizeWriteQueue(state)).toMatchObject({
      labels: [
        { label: "投稿", count: 2, counts: { done: 2, failed: 1, pending: 1 } },
        {
          label: "リアクション",
          count: 1,
          counts: { done: 0, failed: 0, pending: 2 },
        },
      ],
    });
  });

  it("送り先が決まる前の種類には、輪の数を持たせない", () => {
    // 輪は数が無い間は回り続ける。0/0 を渡すと止まった空の輪になる。
    const state = run(start("1", "フォロー"), {
      type: "write-queue/progress",
      id: "1",
      progress: { phase: "checking" },
    });
    expect(summarizeWriteQueue(state)).toMatchObject({
      labels: [{ label: "フォロー", count: 1, counts: undefined }],
      counts: undefined,
    });
  });

  it("署名を待っている書き込みは数えない", () => {
    const state = run(start("1"), start("2"), {
      type: "write-queue/progress",
      id: "2",
      progress: { phase: "signing" },
    });
    expect(summarizeWriteQueue(state)).toMatchObject({ total: 1 });
  });

  it("列が空になったら、保存できた書き込みをまとめて出す", () => {
    const state = run(
      start("1", "ステータス"),
      start("2", "フォロー"),
      { type: "write-queue/finished", id: "1" },
      { type: "write-queue/finished", id: "2" },
    );
    expect(summarizeWriteQueue(state)).toEqual({
      tone: "saved",
      labels: [
        { label: "ステータス", count: 1 },
        { label: "フォロー", count: 1 },
      ],
    });
  });

  it("知らせることが無ければ何も出さない", () => {
    const state = run(start("1", "投稿", { quiet: true }), {
      type: "write-queue/finished",
      id: "1",
    });
    expect(summarizeWriteQueue(state)).toBeUndefined();
  });
});
