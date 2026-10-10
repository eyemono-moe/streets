import { describe, expect, it } from "vite-plus/test";
import {
  type LoginEvent,
  type LoginState,
  initialLoginState,
  needsAuthReset,
  reduceLogin,
} from "./login-state";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const run = (events: LoginEvent[], from = initialLoginState()): LoginState =>
  events.reduce(reduceLogin, from);

describe("reduceLogin", () => {
  it("覚えていた人の画面を先に出し、戻るまで connecting にする", () => {
    expect(run([{ type: "restore-started", pubkey: ALICE }])).toMatchObject({
      pubkey: ALICE,
      status: "connecting",
    });
  });

  it("覚えていた人がいないまま戻し始めても、画面は変えない", () => {
    expect(run([{ type: "restore-started" }])).toEqual(initialLoginState());
  });

  it("戻せなかったら、覚えていた人の画面を読み取りだけで残す", () => {
    // 捕まえる変異: 戻せなかったらログアウトする（スマホで署名器が止まっているだけでも画面が消える）
    const state = run([
      { type: "restore-started", pubkey: ALICE },
      { type: "restore-failed", message: "繋がりません" },
    ]);
    expect(state).toMatchObject({
      pubkey: ALICE,
      status: "disconnected",
      restoreFailed: true,
      error: "繋がりません",
      authStale: true,
    });
  });

  it("覚えていた人がいなければ、戻せなかったときはログインしていない", () => {
    expect(run([{ type: "restore-failed", message: "x" }])).toMatchObject({
      status: "none",
      restoreFailed: true,
    });
  });

  it("繋がったら、前の失敗の表示を消す", () => {
    const state = run([
      { type: "restore-started", pubkey: ALICE },
      { type: "restore-failed", message: "x" },
      { type: "connected", pubkey: ALICE },
    ]);
    expect(state).toEqual({
      pubkey: ALICE,
      status: "ready",
      pending: false,
      restoreFailed: false,
      authStale: false,
    });
  });

  it("処理を始めたら、前の失敗の表示を消す", () => {
    const state = run([
      { type: "failed", message: "x" },
      { type: "task-started" },
    ]);
    expect(state.error).toBeUndefined();
    expect(state.pending).toBe(true);
  });

  it("ログアウトしたら、走っている処理の印だけ残して初めに戻る", () => {
    const state = run([
      { type: "task-started" },
      { type: "connected", pubkey: ALICE },
      { type: "logged-out" },
    ]);
    expect(state).toEqual({ ...initialLoginState(), pending: true });
  });
});

describe("needsAuthReset", () => {
  it("戻すのを待っていた同じ人の署名器なら、リレーの認証を張り直さない", () => {
    const waiting = run([{ type: "restore-started", pubkey: ALICE }]);
    expect(needsAuthReset(waiting, ALICE)).toBe(false);
  });

  it("別の人の署名器に替わったら張り直す", () => {
    // 捕まえる変異: 張り直さない（前のアカウントとしてリレーに読み書きできてしまう）
    const waiting = run([{ type: "restore-started", pubkey: ALICE }]);
    expect(needsAuthReset(waiting, BOB)).toBe(true);
    expect(
      needsAuthReset(run([{ type: "connected", pubkey: ALICE }]), BOB),
    ).toBe(true);
  });

  it("繋がらない間に認証を断っていたら、同じ人でも張り直す", () => {
    const retried = run([
      { type: "restore-started", pubkey: ALICE },
      { type: "restore-failed", message: "x" },
      { type: "restore-started" },
    ]);
    expect(needsAuthReset(retried, ALICE)).toBe(true);
  });

  it("ログアウトでも張り直す", () => {
    expect(
      needsAuthReset(run([{ type: "connected", pubkey: ALICE }]), undefined),
    ).toBe(true);
  });
});
