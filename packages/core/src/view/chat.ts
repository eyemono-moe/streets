import {
  type ChatModeration,
  type MessageVisibility,
  messageVisibility,
} from "../nostr/channel";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { ChatOrder } from "../settings/chat-order-setting";

/** 同じ人が続けて書いたとみなす間隔（秒）。これより空いたら、名前とアイコンを出し直す。 */
const CONTINUE_WITHIN = 5 * 60;

export type ChatRow =
  | { type: "day"; key: string; at: number }
  | {
      type: "message";
      key: string;
      event: NostrEvent;
      /** 1 つ上の行と同じ人の続き。名前とアイコンを省く。 */
      continued: boolean;
      /**
       * この発言の上に出す日付の区切り（その日の時刻）。新しいものを上に並べるときは、
       * 区切りを行にせずここに持つ —— 先頭が区切りの行だと、新しい発言が来ても
       * 先頭の行が変わらず、上に足されたと分からない。
       */
      dayAbove?: number;
      visibility: MessageVisibility;
    };

/** 端末の暦での日付。日付の区切りを入れる境目。 */
const dayOf = (at: number): string => {
  const date = new Date(at * 1000);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * チャットに並べる行を、上から順に返す。日付が変わるところで、その日の発言の上に
 * 区切りを入れる。畳む発言は、続きとしてつなげない（畳んだ行の下に名前の
 * 無い発言が来ると、誰の発言か分からない）。
 */
export const chatRows = (
  messages: readonly NostrEvent[],
  moderation: ChatModeration,
  viewer: string | undefined,
  order: ChatOrder = "newest-last",
): ChatRow[] => {
  const direction = order === "newest-first" ? -1 : 1;
  const sorted = [...messages].sort(
    (a, b) =>
      direction * (a.created_at - b.created_at || a.id.localeCompare(b.id)),
  );
  const rows: ChatRow[] = [];
  let previous: { event: NostrEvent; visible: boolean } | undefined;
  for (const event of sorted) {
    const day = dayOf(event.created_at);
    const newDay = !previous || dayOf(previous.event.created_at) !== day;
    if (newDay) {
      if (direction === 1) {
        rows.push({ type: "day", key: `day:${day}`, at: event.created_at });
      }
      previous = undefined;
    }
    const visibility = messageVisibility(event, moderation, viewer);
    const visible = visibility === "visible";
    const continued =
      visible &&
      previous !== undefined &&
      previous.visible &&
      previous.event.pubkey === event.pubkey &&
      Math.abs(event.created_at - previous.event.created_at) <= CONTINUE_WITHIN;
    rows.push({
      type: "message",
      key: event.id,
      event,
      continued,
      visibility,
      ...(newDay && direction === -1 ? { dayAbove: event.created_at } : {}),
    });
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
/**
 * 正規化してから重ねを除く。nevent や URL のヒントは末尾の `/` が無いまま届き、
 * チャンネルの情報のリレーは正規化されているので、そのまま `Set` にかけると
 * 同じリレーが 2 本に数えられ、情報が届いたところで読むリレーが変わったことになる。
 */
const uniqueRelays = (urls: readonly RelayUrl[]): RelayUrl[] => [
  ...new Set(
    urls.flatMap((url) => {
      const normalized = normalizeRelayUrl(url);
      return normalized ? [normalized] : [];
    }),
  ),
];

export const channelReadRelays = (options: {
  metadata: readonly RelayUrl[];
  hints: readonly RelayUrl[];
  viewerRead: readonly RelayUrl[];
  max?: number;
}): RelayUrl[] => {
  const max = options.max ?? 5;
  const known = uniqueRelays([...options.metadata, ...options.hints]);
  return (known.length > 0 ? known : uniqueRelays(options.viewerRead)).slice(
    0,
    max,
  );
};

/**
 * チャンネルそのもの（kind:40・41）を探すリレー。開いたときに分かっていたリレーに、
 * 自分の読み込みリレーを足す。ヒントのリレーが落ちていると、情報に書かれた
 * リレーへ辿り着けず、発言も読めなくなるため。発言を読むリレーは、見つかった
 * 情報に書かれたリレーで決める（`channelReadRelays`）。
 */
export const channelLookupRelays = (options: {
  hints: readonly RelayUrl[];
  viewerRead: readonly RelayUrl[];
}): RelayUrl[] =>
  uniqueRelays([
    ...options.hints.slice(0, 5),
    ...options.viewerRead.slice(0, 3),
  ]);

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
