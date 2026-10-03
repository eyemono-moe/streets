import { type NostrEvent, verifyEvent } from "@streets/core/nostr/event";
import type { Nip19Ref } from "@streets/core/nostr/nip19";
import {
  BOOTSTRAP_INDEXERS,
  FALLBACK_RELAYS,
} from "@streets/core/read/default-relays";
import type {
  RelayConnection,
  RelayFilter,
} from "@streets/core/relay/relay-connection";
import { normalizeRelayUrl } from "@streets/core/relay/relay-url";

export type Connect = (url: string) => RelayConnection;

/** URL が指すものと、その書き手のプロフィール。どちらも見つからなければ undefined。 */
export type EntityFound = {
  event?: NostrEvent;
  profile?: NostrEvent;
};

/**
 * Workers は 1 回の呼び出しで同時に開ける外への接続が 6 本まで。1 回の問い合わせで
 * 開くリレーはそれより少なくする。
 */
const MAX_RELAYS = 5;

const relaysFor = (
  hints: readonly string[],
  base: readonly string[],
): string[] =>
  [
    ...new Set(
      [...hints, ...base]
        .map((relay) => normalizeRelayUrl(relay))
        .filter((relay) => relay !== undefined),
    ),
  ].slice(0, MAX_RELAYS);

const matches = (event: NostrEvent, filter: RelayFilter): boolean =>
  (!filter.ids || filter.ids.includes(event.id)) &&
  (!filter.authors || filter.authors.includes(event.pubkey)) &&
  (!filter.kinds || filter.kinds.includes(event.kind)) &&
  (!filter["#d"] ||
    event.tags.some(
      (tag) => tag[0] === "d" && filter["#d"]?.includes(tag[1] ?? ""),
    ));

/**
 * いくつかのリレーへ同じ条件で聞き、いちばん新しい 1 件を返す。リレーは何でも
 * 送れるので、条件に合わないものと署名の合わないものは捨てる —— ほかの人の名前で
 * 作った本文がカードに出てしまう。
 */
export const queryNewest = (
  connect: Connect,
  relays: readonly string[],
  filter: RelayFilter,
  timeoutMs: number,
): Promise<NostrEvent | undefined> =>
  new Promise((resolve) => {
    if (relays.length === 0) {
      resolve(undefined);
      return;
    }
    let newest: NostrEvent | undefined;
    let pending = relays.length;
    const connections: RelayConnection[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const connection of connections) connection.close();
      resolve(newest);
    };
    const done = () => {
      pending -= 1;
      if (pending === 0) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    for (const url of relays) {
      let connection: RelayConnection;
      try {
        connection = connect(url);
      } catch {
        done();
        continue;
      }
      connections.push(connection);
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        done();
      };
      connection.subscribe([filter], {
        onEvent: (event) => {
          if (!matches(event, filter) || !verifyEvent(event)) return;
          if (!newest || event.created_at > newest.created_at) newest = event;
          // id で指したものは 1 つしかないので、届いたら待たない。
          if (filter.ids) finish();
        },
        onEose: end,
        onClosed: end,
      });
    }
  });

const profileOf = (
  connect: Connect,
  pubkey: string,
  hints: readonly string[],
  timeoutMs: number,
) =>
  queryNewest(
    connect,
    relaysFor(hints, [...BOOTSTRAP_INDEXERS.slice(0, 2), ...FALLBACK_RELAYS]),
    { kinds: [0], authors: [pubkey], limit: 1 },
    timeoutMs,
  );

/**
 * URL が指すものをリレーから引く。リンクのカードを作るボットは長く待たないので、
 * 1 回の問い合わせごとに `timeoutMs` で切り上げ、見つかった分だけで作る。
 */
export const fetchEntity = async (
  ref: Nip19Ref,
  connect: Connect,
  timeoutMs: number,
): Promise<EntityFound> => {
  switch (ref.kind) {
    case "npub":
    case "nprofile": {
      const hints = ref.kind === "nprofile" ? ref.relays : [];
      const profile = await profileOf(connect, ref.pubkey, hints, timeoutMs);
      return { profile };
    }
    case "note":
    case "nevent": {
      const hints = ref.kind === "nevent" ? ref.relays : [];
      const event = await queryNewest(
        connect,
        relaysFor(hints, FALLBACK_RELAYS),
        { ids: [ref.id] },
        timeoutMs,
      );
      if (!event) return {};
      const profile = await profileOf(connect, event.pubkey, hints, timeoutMs);
      return { event, profile };
    }
    case "naddr": {
      const [event, profile] = await Promise.all([
        queryNewest(
          connect,
          relaysFor(ref.relays, FALLBACK_RELAYS),
          {
            kinds: [ref.eventKind],
            authors: [ref.pubkey],
            "#d": [ref.identifier],
          },
          timeoutMs,
        ),
        // 書き手は住所から分かるので、記事と同時に聞く。合わせて 6 本を超えないよう 1 本に絞る。
        queryNewest(
          connect,
          relaysFor([], BOOTSTRAP_INDEXERS).slice(0, 1),
          { kinds: [0], authors: [ref.pubkey], limit: 1 },
          timeoutMs,
        ),
      ]);
      return { event, profile };
    }
  }
};
