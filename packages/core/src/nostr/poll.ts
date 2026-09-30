import type { RelayUrl } from "../relay/relay-connection";
import type { EventDraft } from "./build/draft";
import type { NostrEvent } from "./event";

/** 投票（NIP-88）。本文が問いで、選択肢は `option` タグにある。 */
export const POLL_KIND = 1068;
/** 投票への回答。`e` で投票を指し、選んだ選択肢を `response` に書く。 */
export const POLL_RESPONSE_KIND = 1018;

/**
 * 回答を取りにいく・送るリレーの上限。投票が指すリレーは明示リレーとして必ず開かれ、
 * 同時接続の枠を無視するので、1 件の投票が枠を食いつぶさないようにする。
 */
export const MAX_POLL_RELAYS = 3;

export type PollOption = { id: string; label: string };

export type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  multiple: boolean;
  /** 締め切り（秒）。無ければ締め切らない。 */
  endsAt: number | undefined;
  /** 回答を集めるリレー。先頭から `MAX_POLL_RELAYS` 件まで。 */
  relays: RelayUrl[];
};

const OPTION_ID = /^[0-9A-Za-z]+$/;

const relayUrl = (value: string | undefined): RelayUrl | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" || url.protocol === "ws:"
      ? (url.href as RelayUrl)
      : undefined;
  } catch {
    return undefined;
  }
};

/** 選択肢が 1 つも無いものは投票として扱えないので読まない。 */
export const parsePoll = (event: NostrEvent): Poll | undefined => {
  if (event.kind !== POLL_KIND) return undefined;
  const options: PollOption[] = [];
  const relays: RelayUrl[] = [];
  let multiple = false;
  let endsAt: number | undefined;
  for (const tag of event.tags) {
    switch (tag[0]) {
      case "option": {
        const id = tag[1];
        const label = tag[2]?.trim();
        if (!id || !OPTION_ID.test(id) || !label) break;
        if (options.some((option) => option.id === id)) break;
        options.push({ id, label });
        break;
      }
      case "relay": {
        const url = relayUrl(tag[1]);
        if (url && !relays.includes(url) && relays.length < MAX_POLL_RELAYS) {
          relays.push(url);
        }
        break;
      }
      case "polltype":
        multiple = tag[1] === "multiplechoice";
        break;
      case "endsAt": {
        const value = Number(tag[1]);
        if (Number.isSafeInteger(value) && value > 0) endsAt = value;
        break;
      }
    }
  }
  if (options.length === 0) return undefined;
  return {
    id: event.id,
    question: event.content.trim(),
    options,
    multiple,
    endsAt,
    relays,
  };
};

export const isPollClosed = (poll: Poll, nowSeconds: number): boolean =>
  poll.endsAt !== undefined && nowSeconds >= poll.endsAt;

/** 回答 1 件が選んだ選択肢。1 つ選ぶ投票では最初の 1 つだけを数える。 */
const choicesOf = (poll: Poll, response: NostrEvent): string[] => {
  const valid = new Set(poll.options.map((option) => option.id));
  const picked: string[] = [];
  for (const tag of response.tags) {
    const id = tag[1];
    if (tag[0] !== "response" || !id || !valid.has(id) || picked.includes(id)) {
      continue;
    }
    picked.push(id);
    if (!poll.multiple) break;
  }
  return picked;
};

export type PollTally = {
  /** 選択肢ごとの票数。 */
  counts: Record<string, number>;
  /** 数えた人数。複数選べる投票では、票数の合計とは違う。 */
  voters: number;
  /** 見ている人が選んだもの。まだ投票していなければ undefined。 */
  mine: string[] | undefined;
};

/**
 * 1 人につき、締め切りまでの最新の回答だけを数える（NIP-88）。
 * 選択肢を 1 つも選んでいない回答は数えない。
 */
export const tallyPoll = (
  poll: Poll,
  responses: readonly NostrEvent[],
  viewer?: string,
): PollTally => {
  const latest = new Map<string, NostrEvent>();
  for (const response of responses) {
    if (response.kind !== POLL_RESPONSE_KIND) continue;
    if (!response.tags.some((tag) => tag[0] === "e" && tag[1] === poll.id)) {
      continue;
    }
    if (poll.endsAt !== undefined && response.created_at > poll.endsAt) {
      continue;
    }
    if (choicesOf(poll, response).length === 0) continue;
    const current = latest.get(response.pubkey);
    if (!current || response.created_at > current.created_at) {
      latest.set(response.pubkey, response);
    }
  }
  const counts: Record<string, number> = Object.fromEntries(
    poll.options.map((option) => [option.id, 0]),
  );
  for (const response of latest.values()) {
    for (const id of choicesOf(poll, response)) counts[id] += 1;
  }
  const own = viewer ? latest.get(viewer) : undefined;
  return {
    counts,
    voters: latest.size,
    mine: own ? choicesOf(poll, own) : undefined,
  };
};

export const buildPollResponse = (
  poll: Poll,
  choices: readonly string[],
): EventDraft => ({
  kind: POLL_RESPONSE_KIND,
  content: "",
  tags: [
    ["e", poll.id],
    ...(poll.multiple ? choices : choices.slice(0, 1)).map((id) => [
      "response",
      id,
    ]),
  ],
});

/** 「あと 2 日」「締め切りました」。締め切りが無ければ undefined。 */
export const pollDeadlineLabel = (
  poll: Poll,
  nowSeconds: number,
): string | undefined => {
  if (poll.endsAt === undefined) return undefined;
  const left = poll.endsAt - nowSeconds;
  if (left <= 0) return "締め切りました";
  if (left < 60 * 60) return `あと ${Math.max(1, Math.floor(left / 60))} 分`;
  if (left < 24 * 60 * 60) return `あと ${Math.floor(left / 3600)} 時間`;
  return `あと ${Math.floor(left / 86_400)} 日`;
};
