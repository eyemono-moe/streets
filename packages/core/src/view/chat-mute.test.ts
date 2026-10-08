import { describe, expect, it } from "vite-plus/test";
import { chatMuteTransition, closedChatMute } from "./chat-mute";

const opened = chatMuteTransition(closedChatMute(), {
  type: "chat-mute/open",
  messageId: "m",
  pubkey: "p",
});
const open = chatMuteTransition(opened, {
  type: "chat-mute/kind",
  value: "user",
});

describe("chatMuteTransition", () => {
  it("開いた直後は、この発言を、このチャンネルだけ", () => {
    expect(opened).toMatchObject({
      phase: "confirming",
      kind: "message",
      scope: "channel",
    });
  });

  it("何をと、どこでを選べる", () => {
    const chosen = chatMuteTransition(open, {
      type: "chat-mute/scope",
      value: "everywhere",
    });
    expect(chosen).toMatchObject({ kind: "user", scope: "everywhere" });
    expect(
      chatMuteTransition(chosen, { type: "chat-mute/submit" }),
    ).toMatchObject({ phase: "sending", kind: "user", scope: "everywhere" });
  });

  it("送っている間は何を・どこでを変えられない", () => {
    // 捕まえる変異: 送っている途中で選びが変わり、送った内容と画面がずれる
    const sending = chatMuteTransition(open, { type: "chat-mute/submit" });
    expect(
      chatMuteTransition(sending, {
        type: "chat-mute/scope",
        value: "everywhere",
      }),
    ).toBe(sending);
    expect(
      chatMuteTransition(sending, { type: "chat-mute/kind", value: "message" }),
    ).toBe(sending);
  });

  it("開いて理由を書き、送ったら閉じる", () => {
    const reasoned = chatMuteTransition(open, {
      type: "chat-mute/reason",
      value: "宣伝",
    });
    const sending = chatMuteTransition(reasoned, { type: "chat-mute/submit" });
    expect(sending).toMatchObject({
      phase: "sending",
      reason: "宣伝",
      kind: "user",
    });
    expect(chatMuteTransition(sending, { type: "chat-mute/sent" })).toEqual(
      closedChatMute(),
    );
  });

  it("送っている間は閉じない", () => {
    // 捕まえる変異: 送っている途中に閉じる（届いたか分からないまま消える）
    const sending = chatMuteTransition(open, { type: "chat-mute/submit" });
    expect(chatMuteTransition(sending, { type: "chat-mute/close" })).toBe(
      sending,
    );
  });

  it("送れなかったら理由を残して確認に戻る", () => {
    const failed = chatMuteTransition(
      chatMuteTransition(
        chatMuteTransition(open, { type: "chat-mute/reason", value: "宣伝" }),
        { type: "chat-mute/submit" },
      ),
      { type: "chat-mute/failed" },
    );
    expect(failed).toMatchObject({ phase: "confirming", reason: "宣伝" });
  });
});
