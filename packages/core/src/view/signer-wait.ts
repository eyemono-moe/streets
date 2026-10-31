import type { Message, MessageKey } from "../i18n/message";

/** 署名器の承認待ちに、イベント番号ではなく操作の名前を見せる。 */
export const signingWaitMessage = (kind: number): Message => ({
  key: signingWaitKey(kind),
});

const signingWaitKey = (kind: number): MessageKey => {
  switch (kind) {
    case 0:
      return "signer.wait.profile";
    case 1:
      return "signer.wait.post";
    case 3:
      return "signer.wait.follow";
    case 5:
      return "signer.wait.delete";
    case 6:
      return "signer.wait.repost";
    case 7:
      return "signer.wait.reaction";
    case 10_000:
      return "signer.wait.mute";
    case 10_002:
      return "signer.wait.relayList";
    case 10_003:
      return "signer.wait.bookmark";
    case 22_242:
      return "signer.wait.relayAuth";
    case 30_078:
      return "signer.wait.settings";
    default:
      return "signer.wait.unknown";
  }
};
