/**
 * チャット内のミュート（NIP-28 の kind:43・44）の確認。ミュートは公開されるので、
 * 押してすぐ送らず、確かめてから送る。理由は任意。
 */
export type ChatMuteState =
  | { phase: "closed" }
  | {
      phase: "confirming" | "sending";
      /** `message` はその発言だけ、`user` はすべてのチャンネルでのその人の発言。 */
      kind: "message" | "user";
      messageId: string;
      pubkey: string;
      reason: string;
    };

export type ChatMuteEvent =
  | {
      type: "chat-mute/open";
      kind: "message" | "user";
      messageId: string;
      pubkey: string;
    }
  | { type: "chat-mute/reason"; value: string }
  | { type: "chat-mute/submit" }
  | { type: "chat-mute/sent" }
  | { type: "chat-mute/failed" }
  | { type: "chat-mute/close" };

export const closedChatMute = (): ChatMuteState => ({ phase: "closed" });

export const chatMuteTransition = (
  state: ChatMuteState,
  event: ChatMuteEvent,
): ChatMuteState => {
  switch (event.type) {
    case "chat-mute/open":
      return state.phase === "sending"
        ? state
        : {
            phase: "confirming",
            kind: event.kind,
            messageId: event.messageId,
            pubkey: event.pubkey,
            reason: "",
          };
  }
  if (state.phase === "closed") return state;
  switch (event.type) {
    case "chat-mute/reason":
      return state.phase === "confirming"
        ? { ...state, reason: event.value }
        : state;
    case "chat-mute/submit":
      return state.phase === "confirming"
        ? { ...state, phase: "sending" }
        : state;
    case "chat-mute/sent":
      return closedChatMute();
    case "chat-mute/failed":
      return { ...state, phase: "confirming" };
    case "chat-mute/close":
      // 送っている間は閉じない。閉じても送るのは止まらないので、結果が分からなくなる。
      return state.phase === "sending" ? state : closedChatMute();
  }
  return state;
};
