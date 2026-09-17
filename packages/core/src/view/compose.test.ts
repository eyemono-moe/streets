import { describe, expect, it } from "vitest";
import {
  type ComposeEvent,
  type ComposeState,
  composeTransition,
  emptyCompose,
  sendableText,
} from "./compose";

const run = (...events: ComposeEvent[]): ComposeState =>
  events.reduce(composeTransition, emptyCompose());

describe("composeTransition", () => {
  it("書いた本文を持つ", () => {
    expect(run({ type: "compose/input", content: "こんにちは" }).content).toBe(
      "こんにちは",
    );
  });

  it("空白だけでは送らない", () => {
    const state = run(
      { type: "compose/input", content: "  \n " },
      { type: "compose/submit" },
    );
    expect(state.sending).toBe(false);
  });

  it("送ると送っている途中になり、本文は変えられない", () => {
    const state = run(
      { type: "compose/input", content: "送る" },
      { type: "compose/submit" },
      { type: "compose/input", content: "書き換え" },
    );
    expect(state).toEqual({ content: "送る", sending: true });
  });

  it("送っている途中にもう一度送っても、状態は変わらない", () => {
    const sending = run(
      { type: "compose/input", content: "送る" },
      { type: "compose/submit" },
    );
    expect(composeTransition(sending, { type: "compose/submit" })).toBe(
      sending,
    );
  });

  it("送れたら本文を空にする", () => {
    const state = run(
      { type: "compose/input", content: "送る" },
      { type: "compose/submit" },
      { type: "compose/sent" },
    );
    expect(state).toEqual(emptyCompose());
  });

  it("送れなかったら本文を残して、送り直せるようにする", () => {
    const state = run(
      { type: "compose/input", content: "送る" },
      { type: "compose/submit" },
      { type: "compose/failed" },
    );
    expect(state).toEqual({ content: "送る", sending: false });
    expect(sendableText(state)).toBe("送る");
  });

  it("送っていないのに届いた「送れた」は無視する", () => {
    const editing = run({ type: "compose/input", content: "書きかけ" });
    expect(composeTransition(editing, { type: "compose/sent" })).toBe(editing);
  });
});

describe("sendableText", () => {
  it("前後の空白を落とした本文を返す", () => {
    expect(sendableText({ content: "  本文 \n", sending: false })).toBe("本文");
  });

  it("送っている途中は返さない", () => {
    expect(sendableText({ content: "本文", sending: true })).toBeUndefined();
  });
});
