import { describe, expect, it } from "vitest";
import {
  type ComposeEvent,
  type ComposeState,
  canSend,
  composeMedia,
  composeTransition,
  emptyCompose,
  pendingAttachments,
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
    expect(canSend(state)).toBe(true);
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
});

describe("canSend", () => {
  it("本文もファイルも無ければ送らない", () => {
    expect(canSend(emptyCompose())).toBe(false);
  });

  it("送っている途中は送らない", () => {
    expect(canSend({ ...emptyCompose(), content: "本文", sending: true })).toBe(
      false,
    );
  });

  it("本文が空でも、ファイルを添えていれば送れる", () => {
    const state = run({
      type: "compose/attach-add",
      id: "1",
      name: "cat.png",
      preview: "blob:cat",
    });
    expect(canSend(state)).toBe(true);
  });
});

describe("ファイルを添える", () => {
  const blob = {
    url: "https://a.example/cat.png",
    sha256: "f".repeat(64),
    size: 3,
    type: "image/png",
  };
  const add = (id: string, name: string): ComposeEvent => ({
    type: "compose/attach-add",
    id,
    name,
    preview: `blob:${id}`,
  });

  it("添えただけでは、まだ預けていない", () => {
    const state = run(add("1", "cat.png"));
    expect(pendingAttachments(state).map((a) => a.id)).toEqual(["1"]);
    expect(composeMedia(state)).toEqual([]);
    // 本文は触らない —— URL は送るときに末尾へ並べる。
    expect(state.content).toBe("");
  });

  it("預け終わったものは、添えるものに数える", () => {
    const state = run(add("1", "cat.png"), {
      type: "compose/attach-done",
      id: "1",
      blob,
    });
    expect(pendingAttachments(state)).toEqual([]);
    expect(composeMedia(state)).toEqual([blob]);
  });

  it("並べ替えた順で添える", () => {
    const state = run(add("1", "1.png"), add("2", "2.png"), add("3", "3.png"), {
      type: "compose/attach-move",
      id: "3",
      to: 0,
    });
    expect(state.attachments.map((a) => a.id)).toEqual(["3", "1", "2"]);
  });

  it("並べ替えの行き先が端を越えても、端で止める", () => {
    const state = run(add("1", "1.png"), add("2", "2.png"), {
      type: "compose/attach-move",
      id: "1",
      to: 9,
    });
    expect(state.attachments.map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("切り抜く範囲を持つ。元の画像はそのまま残す", () => {
    const crop = { x: 10, y: 20, width: 100, height: 80 };
    const state = run(add("1", "cat.png"), {
      type: "compose/attach-crop",
      id: "1",
      crop,
    });
    expect(state.attachments[0]?.crop).toEqual(crop);
    // 何度でも切り直せるよう、元の画像の見本は差し替えない。
    expect(state.attachments[0]?.preview).toBe("blob:1");
  });

  it("切り抜き直すと、預けたものは捨てて預け直す", () => {
    const state = run(
      add("1", "cat.png"),
      { type: "compose/attach-done", id: "1", blob },
      {
        type: "compose/attach-crop",
        id: "1",
        crop: { x: 0, y: 0, width: 10, height: 10 },
      },
    );
    expect(composeMedia(state)).toEqual([]);
    expect(pendingAttachments(state).map((a) => a.id)).toEqual(["1"]);
  });

  it("切り抜きをやめると全体に戻る", () => {
    const state = run(
      add("1", "cat.png"),
      {
        type: "compose/attach-crop",
        id: "1",
        crop: { x: 0, y: 0, width: 10, height: 10 },
      },
      { type: "compose/attach-crop", id: "1", crop: undefined },
    );
    expect(state.attachments[0]?.crop).toBeUndefined();
  });

  it("外したファイルは添えない", () => {
    const state = run(add("1", "cat.png"), {
      type: "compose/attach-remove",
      id: "1",
    });
    expect(state.attachments).toEqual([]);
  });

  it("預けられなかった理由を持ち、送り直すと消える", () => {
    let state = run(add("1", "cat.png"), {
      type: "compose/attach-uploading",
      id: "1",
    });
    expect(state.attachments[0]?.uploading).toBe(true);
    state = composeTransition(state, {
      type: "compose/attach-failed",
      id: "1",
      error: "大きすぎます",
    });
    expect(state.attachments[0]).toMatchObject({
      uploading: false,
      error: "大きすぎます",
    });
    state = composeTransition(state, { type: "compose/submit" });
    expect(state.attachments[0]?.error).toBeUndefined();
    expect(state.sending).toBe(true);
  });

  it("送れたら、添えたものごと空になる", () => {
    const state = run(
      add("1", "cat.png"),
      { type: "compose/attach-done", id: "1", blob },
      { type: "compose/submit" },
      { type: "compose/sent" },
    );
    expect(state).toEqual(emptyCompose());
  });
});
