import { describe, expect, it } from "vitest";
import {
  type ComposeEvent,
  type ComposeState,
  composeMedia,
  composeTransition,
  emptyCompose,
  isUploading,
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
    expect(state).toEqual({
      ...emptyCompose(),
      content: "送る",
      sending: true,
    });
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
    expect(state).toEqual({ ...emptyCompose(), content: "送る" });
    expect(sendableText(state)).toBe("送る");
  });

  it("送っていないのに届いた「送れた」は無視する", () => {
    const editing = run({ type: "compose/input", content: "書きかけ" });
    expect(composeTransition(editing, { type: "compose/sent" })).toBe(editing);
  });
});

describe("sendableText", () => {
  it("前後の空白を落とした本文を返す", () => {
    expect(sendableText({ ...emptyCompose(), content: "  本文 \n" })).toBe(
      "本文",
    );
  });

  it("送っている途中は返さない", () => {
    expect(
      sendableText({ ...emptyCompose(), content: "本文", sending: true }),
    ).toBeUndefined();
  });
});

describe("ファイルを添える", () => {
  const blob = {
    url: "https://a.example/cat.png",
    sha256: "f".repeat(64),
    size: 3,
    type: "image/png",
  };

  it("預けている途中は送らせない", () => {
    const state = composeTransition(
      composeTransition(emptyCompose(), {
        type: "compose/input",
        content: "ねこ",
      }),
      { type: "compose/attach-start", id: "1", name: "cat.png" },
    );
    expect(isUploading(state)).toBe(true);
    expect(sendableText(state)).toBeUndefined();
  });

  it("預け終わったら本文の末尾に URL を足し、添えるものに数える", () => {
    let state = composeTransition(emptyCompose(), {
      type: "compose/input",
      content: "ねこ",
    });
    state = composeTransition(state, {
      type: "compose/attach-start",
      id: "1",
      name: "cat.png",
    });
    state = composeTransition(state, {
      type: "compose/attach-done",
      id: "1",
      blob,
    });
    expect(state.content).toBe(`ねこ\n${blob.url}`);
    expect(state.uploads).toEqual([]);
    expect(composeMedia(state)).toEqual([blob]);
    expect(sendableText(state)).toBe(`ねこ\n${blob.url}`);
  });

  it("本文から URL を消したら、そのファイルは添えない", () => {
    let state = composeTransition(emptyCompose(), {
      type: "compose/attach-start",
      id: "1",
      name: "cat.png",
    });
    state = composeTransition(state, {
      type: "compose/attach-done",
      id: "1",
      blob,
    });
    state = composeTransition(state, {
      type: "compose/input",
      content: "やっぱりやめた",
    });
    expect(composeMedia(state)).toEqual([]);
  });

  it("失敗は理由を残し、消せる。ほかのファイルは送れる", () => {
    let state = composeTransition(emptyCompose(), {
      type: "compose/attach-start",
      id: "1",
      name: "cat.png",
    });
    state = composeTransition(state, {
      type: "compose/attach-failed",
      id: "1",
      error: "大きすぎます",
    });
    expect(isUploading(state)).toBe(false);
    expect(state.uploads[0]?.error).toBe("大きすぎます");
    state = composeTransition(state, {
      type: "compose/attach-dismiss",
      id: "1",
    });
    expect(state.uploads).toEqual([]);
  });

  it("送れたら、添えたものごと空になる", () => {
    let state = composeTransition(emptyCompose(), {
      type: "compose/attach-start",
      id: "1",
      name: "cat.png",
    });
    state = composeTransition(state, {
      type: "compose/attach-done",
      id: "1",
      blob,
    });
    state = composeTransition(state, { type: "compose/submit" });
    state = composeTransition(state, { type: "compose/sent" });
    expect(state).toEqual(emptyCompose());
  });
});
