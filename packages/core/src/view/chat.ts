import {
  type ChatModeration,
  type MessageVisibility,
  messageVisibility,
} from "../nostr/channel";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";

/** 同じ人が続けて書いたとみなす間隔（秒）。これより空いたら、名前とアイコンを出し直す。 */
const CONTINUE_WITHIN = 5 * 60;

export type ChatRow =
  | { type: "day"; key: string; at: number }
  | {
      type: "message";
      key: string;
      event: NostrEvent;
      /** 直前と同じ人の続き。名前とアイコンを省く。 */
      continued: boolean;
      visibility: MessageVisibility;
    };

/** 端末の暦での日付。日付の区切りを入れる境目。 */
const dayOf = (at: number): string => {
  const date = new Date(at * 1000);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * チャットに並べる行。古い順に並べ、日付が変わるところに区切りを入れる。
 * 畳む発言は、続きとしてつなげない（畳んだ行の後ろに名前の無い発言が来ると、
 * 誰の発言か分からない）。
 */
export const chatRows = (
  messages: readonly NostrEvent[],
  moderation: ChatModeration,
  viewer: string | undefined,
): ChatRow[] => {
  const sorted = [...messages].sort(
    (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
  );
  const rows: ChatRow[] = [];
  let previous: { event: NostrEvent; visible: boolean } | undefined;
  for (const event of sorted) {
    const day = dayOf(event.created_at);
    if (!previous || dayOf(previous.event.created_at) !== day) {
      rows.push({ type: "day", key: `day:${day}`, at: event.created_at });
      previous = undefined;
    }
    const visibility = messageVisibility(event, moderation, viewer);
    const visible = visibility === "visible";
    const continued =
      visible &&
      previous !== undefined &&
      previous.visible &&
      previous.event.pubkey === event.pubkey &&
      event.created_at - previous.event.created_at <= CONTINUE_WITHIN;
    rows.push({ type: "message", key: event.id, event, continued, visibility });
    previous = { event, visible };
  }
  return rows;
};

/**
 * チャンネルを読むリレー。チャンネルの情報に書かれたリレーを先に使い、分からない
 * うちは、開いたときに分かっていたリレー（nevent のヒントなど）を使う。どちらも
 * 無ければ自分の読み込みリレーで探す。明示したリレーは接続の予算から落とされない
 * ので、本数に上限を切る。
 */
export const channelReadRelays = (options: {
  metadata: readonly RelayUrl[];
  hints: readonly RelayUrl[];
  viewerRead: readonly RelayUrl[];
  max?: number;
}): RelayUrl[] => {
  const max = options.max ?? 5;
  const known = [...new Set([...options.metadata, ...options.hints])];
  return (known.length > 0 ? known : [...new Set(options.viewerRead)]).slice(
    0,
    max,
  );
};

/** チャットの入力欄の、返信先。本文そのものは投稿と同じ `ComposeState` が持つ。 */
export type ChatReplyState = { replyTo?: string };

export type ChatReplyEvent =
  | { type: "chat/reply"; target: string }
  | { type: "chat/cancel-reply" }
  /** 送れた。返信先も外す（続けて書くと、また同じ人への返信になってしまう）。 */
  | { type: "compose/sent" };

export const emptyChatReply = (): ChatReplyState => ({});

export const chatReplyTransition = (
  state: ChatReplyState,
  event: ChatReplyEvent,
): ChatReplyState => {
  switch (event.type) {
    case "chat/reply":
      return { replyTo: event.target };
    case "chat/cancel-reply":
    case "compose/sent":
      return {};
  }
  return state;
};
