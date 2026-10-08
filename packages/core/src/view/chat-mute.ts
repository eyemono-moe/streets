/**
 * チャンネルの発言のミュートの確認。「何を」（発言・人）と「どこで」（このチャンネルだけ・
 * どこでも）を選ばせる。チャンネルだけのミュート（NIP-28 の kind:43・44）は公開されるので、
 * 押してすぐ送らず、確かめてから送る。理由はそのときだけ使う。
 */
export type ChatMuteKind = "message" | "user";
export type ChatMuteScope = "channel" | "everywhere";

export type ChatMuteState =
  | { phase: "closed" }
  | {
      phase: "confirming" | "sending";
      /** `message` はその発言だけ、`user` はその人の発言すべて。 */
      kind: ChatMuteKind;
      scope: ChatMuteScope;
      messageId: string;
      pubkey: string;
      reason: string;
    };

export type ChatMuteEvent =
  | { type: "chat-mute/open"; messageId: string; pubkey: string }
  | { type: "chat-mute/kind"; value: ChatMuteKind }
  | { type: "chat-mute/scope"; value: ChatMuteScope }
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
            kind: "message",
            scope: "channel",
            messageId: event.messageId,
            pubkey: event.pubkey,
            reason: "",
          };
  }
  if (state.phase === "closed") return state;
  switch (event.type) {
    case "chat-mute/kind":
      return state.phase === "confirming"
        ? { ...state, kind: event.value }
        : state;
    case "chat-mute/scope":
      return state.phase === "confirming"
        ? { ...state, scope: event.value }
        : state;
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
