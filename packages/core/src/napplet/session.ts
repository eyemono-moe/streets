/*
 * ランチャー側の受け答え。napplet 1 つにつき 1 つ作り、届いたメッセージを Streets の
 * 機能（`NappletHost`）につなぐ。iframe と `postMessage` は持たず、送り主の確認は
 * 呼ぶ側（`MessageEvent.source` を見る）が済ませてから `receive` に渡す。
 *
 * NIP-5D:
 * > Messages with an unrecognized `type` MUST be silently ignored.
 * NAP-RELAY（napplet/naps PR #2、2026-10-10 版）:
 * > The shell MUST respond to every request with a result or lifecycle message carrying the same
 * > `id` or `subId`.
 * > Subscription filters SHOULD be validated to prevent resource exhaustion.
 */
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import {
  NAPPLET_RESOURCE_MAX_BYTES,
  NAPPLET_RESOURCE_MAX_SERVERS,
  NAPPLET_RESOURCE_MAX_URLS,
  type NappletResourceResult,
} from "./resource";

export type NappletTheme = {
  colors: { background: string; text: string; primary: string };
  title?: string;
};

export type NappletProfile = {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
};

export type NappletStorageScope = "shared" | "instance";

export type NappletSubscriptionSink = {
  event: (event: NostrEvent, relay?: string) => void;
  /** 保存済みのものを出し終えた。以後は新しく届いたものだけ。 */
  eose: () => void;
};

/** napplet に渡す Streets の機能。渡さない機能は `domains` に入れない。 */
export type NappletHost = {
  domains: readonly string[];
  /** ログインしていなければ `""`。 */
  publicKey: () => string;
  relays: () => Record<string, { read: boolean; write: boolean }>;
  profile: () => Promise<NappletProfile | null>;
  follows: () => Promise<readonly string[]>;
  mutes: () => Promise<readonly string[]>;
  theme: () => NappletTheme;
  storage: {
    get: (scope: NappletStorageScope, key: string) => string | null;
    /** 枠を超えたら例外を投げる。 */
    set: (scope: NappletStorageScope, key: string, value: string) => void;
    remove: (scope: NappletStorageScope, key: string) => void;
    keys: (scope: NappletStorageScope) => string[];
  };
  /**
   * 読み取り層へ購読を張る。著者が分かるフィルタは Outbox で行き先が決まるので、
   * NAP-RELAY と NAP-OUTBOX のどちらもこれを使う。`hints` は行き先に足すリレー。
   */
  subscribe: (
    filters: RelayFilter[],
    sink: NappletSubscriptionSink,
    hints?: readonly string[],
  ) => () => void;
  /** その人の書き込み先（NIP-65）。分からなければ `undefined`。 */
  writeRelays: (pubkey: string) => readonly string[] | undefined;
  /** 画像などの中身を取る（`fetchNappletResource`）。 */
  fetchResource: (
    url: string,
    servers: readonly string[],
    signal: AbortSignal,
  ) => Promise<NappletResourceResult>;
};

type Message = { type: string; [key: string]: unknown };

/** 1 回の購読で napplet が求められる件数の上限。`limit` が無い・大きい購読はここで切る。 */
export const NAPPLET_MAX_LIMIT = 500;
/** 1 つの napplet が同時に張れる購読の数。 */
export const NAPPLET_MAX_SUBSCRIPTIONS = 20;
/** `relay.query` は保存済みのものを出し終えるまで待つ。リレーが黙ったときに永遠に待たない。 */
export const NAPPLET_QUERY_TIMEOUT_MS = 15_000;
/** napplet が足せるリレーのヒントの数。明示した行き先は接続の予算を超えても開くので絞る。 */
export const NAPPLET_MAX_RELAY_HINTS = 4;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * napplet が渡したフィルタを、読み取り層へ渡せる形に絞る。誰の・どの kind の・何を指す
 * かのどれも無いフィルタは、リレーの全イベントを流す購読になるので受けない。
 */
export const sanitizeNappletFilters = (
  raw: unknown,
): RelayFilter[] | undefined => {
  // NAP-OUTBOX: > `filters` are NIP-01 filters, either one filter or an array of filters.
  const list = isRecord(raw) ? [raw] : raw;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const filters: RelayFilter[] = [];
  for (const item of list) {
    if (!isRecord(item)) return undefined;
    const filter: RelayFilter = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === "ids" || key === "authors") {
        if (!stringList(value)) return undefined;
        filter[key] = value;
      } else if (key === "kinds") {
        if (!Array.isArray(value) || !value.every(Number.isInteger))
          return undefined;
        filter.kinds = value as number[];
      } else if (key === "since" || key === "until" || key === "limit") {
        if (typeof value !== "number" || !Number.isFinite(value))
          return undefined;
        filter[key] = Math.max(0, Math.floor(value));
      } else if (key === "search") {
        if (typeof value !== "string") return undefined;
        filter.search = value;
      } else if (/^#[a-zA-Z]$/.test(key)) {
        if (!stringList(value)) return undefined;
        filter[key as `#${string}`] = value;
      }
      // 知らないキーは落とす。リレーに知らない条件を送ると、断られるか無視される。
    }
    const scoped =
      filter.ids !== undefined ||
      filter.authors !== undefined ||
      filter.kinds !== undefined ||
      Object.keys(filter).some((key) => key.startsWith("#"));
    if (!scoped) return undefined;
    filter.limit = Math.min(
      filter.limit ?? NAPPLET_MAX_LIMIT,
      NAPPLET_MAX_LIMIT,
    );
    filters.push(filter);
  }
  return filters;
};

/** kind:0 の中身を NAP-IDENTITY の `ProfileData` にする。 */
export const nappletProfile = (content: string): NappletProfile | null => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const text = (key: string) => {
    const value = json[key];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const profile: NappletProfile = {
    name: text("name"),
    displayName: text("display_name") ?? text("displayName"),
    about: text("about"),
    picture: text("picture"),
    banner: text("banner"),
    nip05: text("nip05"),
    lud16: text("lud16"),
    website: text("website"),
  };
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined),
  );
};

/** napplet が添えたリレーのヒント。`wss://` のものだけを、数を絞って使う。 */
const relayHints = (options: unknown): string[] => {
  if (!isRecord(options) || !stringList(options.relays)) return [];
  return [
    ...new Set(options.relays.filter((url) => url.startsWith("wss://"))),
  ].slice(0, NAPPLET_MAX_RELAY_HINTS);
};

const timeoutOf = (options: unknown): number => {
  const requested = isRecord(options) ? options.timeoutMs : undefined;
  return typeof requested === "number" && requested > 0
    ? Math.min(requested, NAPPLET_QUERY_TIMEOUT_MS)
    : NAPPLET_QUERY_TIMEOUT_MS;
};

type EventResult = { event: NostrEvent; sidecar?: { relayHints: string[] } };

const resultOf = (event: NostrEvent, relay?: string): EventResult => ({
  event,
  ...(relay ? { sidecar: { relayHints: [relay] } } : {}),
});

export type NappletSession = {
  /** 送り主を確かめたメッセージを渡す。 */
  receive: (data: unknown) => void;
  /** ランチャー側のテーマが変わった。 */
  themeChanged: () => void;
  /** ログインしている人が変わった。 */
  identityChanged: () => void;
  dispose: () => void;
};

export const createNappletSession = (
  host: NappletHost,
  post: (message: Message) => void,
  options: {
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
  } = {},
): NappletSession => {
  const schedule = options.setTimeout ?? setTimeout;
  const cancel = options.clearTimeout ?? clearTimeout;
  const exposed = new Set(host.domains);
  const subscriptions = new Map<string, () => void>();
  const queries = new Set<() => void>();
  const fetches = new Map<string, AbortController>();
  let initialized = false;
  let disposed = false;

  const send = (message: Message) => {
    if (!disposed) post(message);
  };
  const reply = (request: Message, payload: Record<string, unknown>) =>
    send({ ...payload, type: `${request.type}.result`, id: request.id });
  const fail = (request: Message, error: string) => reply(request, { error });

  const answer = async (
    request: Message,
    field: string,
    read: () => Promise<unknown>,
  ) => {
    try {
      reply(request, { [field]: await read() });
    } catch (error) {
      fail(request, error instanceof Error ? error.message : String(error));
    }
  };

  const scopeOf = (request: Message): NappletStorageScope | undefined =>
    request.scope === undefined || request.scope === "shared"
      ? "shared"
      : request.scope === "instance"
        ? "instance"
        : undefined;

  const handleShell = (message: Message) => {
    if (message.type !== "shell.ready" || initialized) return;
    initialized = true;
    send({
      type: "shell.init",
      capabilities: { domains: [...host.domains] },
      services: [],
    });
  };

  const handleTheme = (request: Message) => {
    if (request.type === "theme.get") reply(request, { theme: host.theme() });
  };

  const handleIdentity = (request: Message) => {
    switch (request.type) {
      case "identity.getPublicKey":
        reply(request, { pubkey: host.publicKey() });
        return;
      case "identity.getRelays":
        reply(request, { relays: host.relays() });
        return;
      case "identity.getProfile":
        void answer(request, "profile", host.profile);
        return;
      case "identity.getFollows":
        void answer(request, "pubkeys", host.follows);
        return;
      case "identity.getMutes":
        void answer(request, "pubkeys", host.mutes);
        return;
      case "identity.getList":
      case "identity.getZaps":
      case "identity.getBlocked":
      case "identity.getBadges":
        fail(request, "unsupported");
        return;
    }
  };

  const handleStorage = (request: Message) => {
    const scope = scopeOf(request);
    if (scope === undefined) {
      fail(request, "invalid scope");
      return;
    }
    const key = request.key;
    try {
      switch (request.type) {
        case "storage.get":
          if (typeof key !== "string") return fail(request, "invalid key");
          reply(request, { value: host.storage.get(scope, key) });
          return;
        case "storage.set":
          if (typeof key !== "string" || typeof request.value !== "string") {
            return fail(request, "invalid key or value");
          }
          host.storage.set(scope, key, request.value);
          reply(request, {});
          return;
        case "storage.remove":
          if (typeof key !== "string") return fail(request, "invalid key");
          host.storage.remove(scope, key);
          reply(request, {});
          return;
        case "storage.keys":
          reply(request, { keys: host.storage.keys(scope) });
          return;
      }
    } catch (error) {
      fail(request, error instanceof Error ? error.message : String(error));
    }
  };

  const closeSubscription = (subId: string) => {
    subscriptions.get(subId)?.();
    subscriptions.delete(subId);
  };

  /** 購読を張る。張れなければ理由を返す。 */
  const openSubscription = (
    subId: string,
    rawFilters: unknown,
    hints: readonly string[],
    sink: NappletSubscriptionSink,
  ): string | undefined => {
    closeSubscription(subId);
    const filters = sanitizeNappletFilters(rawFilters);
    if (!filters) return "invalid: filters";
    if (subscriptions.size >= NAPPLET_MAX_SUBSCRIPTIONS) {
      return "rate-limited: too many subscriptions";
    }
    subscriptions.set(subId, host.subscribe(filters, sink, hints));
    return undefined;
  };

  /**
   * 保存済みのものを出し終えるまで集めて返す。時間が来たら、それまでのものを
   * 返す（`incomplete`）。
   */
  const collect = (
    filters: RelayFilter[],
    hints: readonly string[],
    timeoutMs: number,
    done: (events: EventResult[], incomplete: boolean) => void,
  ) => {
    const events = new Map<string, EventResult>();
    let finished = false;
    let close: () => void = () => {};
    const finish = (incomplete: boolean) => {
      if (finished) return;
      finished = true;
      cancel(timer);
      queries.delete(stop);
      close();
      done([...events.values()], incomplete);
    };
    const stop = () => {
      finished = true;
      cancel(timer);
      close();
    };
    const timer = schedule(() => finish(true), timeoutMs);
    queries.add(stop);
    close = host.subscribe(
      filters,
      {
        event: (event, relay) => {
          if (finished || events.has(event.id)) return;
          events.set(event.id, resultOf(event, relay));
        },
        eose: () => finish(false),
      },
      hints,
    );
    // 購読を張る前に保存済みのものだけで片付いたときは、張った購読をここで閉じる。
    if (finished) close();
  };

  const handleRelay = (request: Message) => {
    switch (request.type) {
      case "relay.subscribe": {
        const subId = request.subId;
        if (typeof subId !== "string") return;
        const closed = (reason: string) =>
          send({ type: "relay.closed", subId, reason });
        // 指定したリレーへ直に繋ぐ購読は、Streets の接続の上限と許可の外になるので、まだ受けない。
        if (request.relay !== undefined) {
          closeSubscription(subId);
          return closed("unsupported: scoped relay");
        }
        const refused = openSubscription(subId, request.filters, [], {
          event: (event, relay) =>
            send({
              type: "relay.event",
              subId,
              result: resultOf(event, relay),
            }),
          eose: () => send({ type: "relay.eose", subId }),
        });
        if (refused) closed(refused);
        return;
      }
      case "relay.close":
        if (typeof request.subId === "string") closeSubscription(request.subId);
        return;
      case "relay.query": {
        const filters = sanitizeNappletFilters(request.filters);
        if (!filters) return fail(request, "invalid: filters");
        collect(filters, [], NAPPLET_QUERY_TIMEOUT_MS, (events) =>
          reply(request, { events }),
        );
        return;
      }
      case "relay.publish":
      case "relay.publishEncrypted":
        fail(
          request,
          "unsupported: this shell does not publish for napplets yet",
        );
        return;
    }
  };

  /*
   * NAP-OUTBOX（napplet/naps PR #32、2026-10-12 版）。行き先は読み取り層が NIP-65 から
   * 決めるので、NAP-RELAY と同じ購読をそのまま使う。
   * > `outbox.getEvent` is a request; `outbox.event` remains the subscription push message.
   */
  const handleOutbox = (request: Message) => {
    const hints = relayHints(request.options);
    switch (request.type) {
      case "outbox.subscribe": {
        const subId = request.subId;
        if (typeof subId !== "string") return;
        const refused = openSubscription(subId, request.filters, hints, {
          event: (event, relay) =>
            send({
              type: "outbox.event",
              subId,
              result: resultOf(event, relay),
            }),
          // NAP-OUTBOX の購読には EOSE の知らせが無い。
          eose: () => {},
        });
        if (refused) send({ type: "outbox.closed", subId, reason: refused });
        return;
      }
      case "outbox.close":
        if (typeof request.subId === "string") closeSubscription(request.subId);
        return;
      case "outbox.query": {
        const filters = sanitizeNappletFilters(request.filters);
        if (!filters)
          return reply(request, { events: [], error: "invalid: filters" });
        collect(
          filters,
          hints,
          timeoutOf(request.options),
          (events, incomplete) =>
            reply(request, { events, ...(incomplete ? { incomplete } : {}) }),
        );
        return;
      }
      case "outbox.getEvent": {
        const eventId = request.eventId;
        if (typeof eventId !== "string" || !/^[0-9a-f]{64}$/.test(eventId)) {
          return reply(request, { error: "invalid: eventId" });
        }
        const options = isRecord(request.options) ? request.options : {};
        // 著者が分かれば、その人の書き込み先から引ける（Outbox）。
        const author =
          typeof options.author === "string" &&
          /^[0-9a-f]{64}$/.test(options.author)
            ? options.author
            : undefined;
        const filter: RelayFilter = {
          ids: [eventId],
          ...(author ? { authors: [author] } : {}),
          limit: 1,
        };
        collect([filter], hints, timeoutOf(options), (events, incomplete) =>
          reply(request, {
            ...(events[0] ? { result: events[0] } : {}),
            ...(incomplete && !events[0] ? { incomplete } : {}),
          }),
        );
        return;
      }
      case "outbox.resolveRelays": {
        const target = isRecord(request.target) ? request.target : {};
        const authors = [
          ...(stringList(target.authors) ? target.authors : []),
          ...(typeof target.pubkey === "string" ? [target.pubkey] : []),
        ];
        const known = authors.map((pubkey) => ({
          pubkey,
          relays: host.writeRelays(pubkey),
        }));
        const relays = [
          ...new Set(known.flatMap((entry) => entry.relays ?? [])),
        ];
        const missingAuthors = known
          .filter((entry) => entry.relays === undefined)
          .map((entry) => entry.pubkey);
        reply(request, {
          plan: {
            relays,
            source: relays.length > 0 ? "nip65" : "fallback",
            ...(missingAuthors.length > 0 ? { missingAuthors } : {}),
          },
        });
        return;
      }
      case "outbox.publish":
        reply(request, {
          ok: false,
          error: "unsupported: this shell does not publish for napplets yet",
        });
        return;
    }
  };

  /*
   * NAP-RESOURCE。結果は `<type>.result`、失敗は `<type>.error` で返す（@napplet/shim の形）。
   * 取っている途中に napplet が `resource.cancel` を送ったら、取るのをやめる。
   */
  const handleResource = (request: Message) => {
    const id = request.id as string;
    const serversOf = (raw: unknown) =>
      stringList(raw)
        ? raw
            .filter((server) => server.startsWith("https://"))
            .slice(0, NAPPLET_RESOURCE_MAX_SERVERS)
        : [];
    const start = (url: string, servers: readonly string[]) => {
      const controller = new AbortController();
      fetches.set(id, controller);
      return host
        .fetchResource(url, servers, controller.signal)
        .catch((error): NappletResourceResult => ({
          ok: false,
          error: "network-error",
          message: String(error),
        }));
    };
    const done = () => fetches.delete(id);
    switch (request.type) {
      case "resource.info":
        send({
          type: "resource.info.result",
          id,
          info: {
            schemes: [
              { scheme: "https", enabled: true },
              { scheme: "blossom", enabled: true },
              { scheme: "data", enabled: true },
              { scheme: "nostr", enabled: false },
              { scheme: "htree", enabled: false },
            ],
            maxBytes: NAPPLET_RESOURCE_MAX_BYTES,
            maxUrls: NAPPLET_RESOURCE_MAX_URLS,
            maxServers: NAPPLET_RESOURCE_MAX_SERVERS,
          },
        });
        return;
      case "resource.bytes": {
        if (typeof request.url !== "string") {
          send({ type: "resource.bytes.error", id, error: "invalid-request" });
          return;
        }
        void start(request.url, serversOf(request.servers)).then((result) => {
          const cancelled = !fetches.has(id);
          done();
          if (cancelled) return;
          send(
            result.ok
              ? {
                  type: "resource.bytes.result",
                  id,
                  blob: result.blob,
                  mime: result.mime,
                }
              : {
                  type: "resource.bytes.error",
                  id,
                  error: result.error,
                  ...(result.message ? { message: result.message } : {}),
                },
          );
        });
        return;
      }
      case "resource.bytesMany": {
        const requests = Array.isArray(request.requests)
          ? request.requests
          : [];
        if (
          requests.length === 0 ||
          requests.length > NAPPLET_RESOURCE_MAX_URLS ||
          !requests.every(
            (item) => isRecord(item) && typeof item.url === "string",
          )
        ) {
          send({
            type: "resource.bytesMany.error",
            id,
            error: "invalid-request",
          });
          return;
        }
        const controller = new AbortController();
        fetches.set(id, controller);
        void Promise.all(
          (requests as { url: string; servers?: unknown }[]).map(
            ({ url, servers }) =>
              host
                .fetchResource(url, serversOf(servers), controller.signal)
                .catch((error): NappletResourceResult => ({
                  ok: false,
                  error: "network-error",
                  message: String(error),
                }))
                .then((result) =>
                  result.ok
                    ? { url, ok: true, blob: result.blob, mime: result.mime }
                    : {
                        url,
                        ok: false,
                        error: result.error,
                        ...(result.message ? { message: result.message } : {}),
                      },
                ),
          ),
        ).then((items) => {
          const cancelled = !fetches.has(id);
          done();
          if (!cancelled)
            send({ type: "resource.bytesMany.result", id, items });
        });
        return;
      }
      case "resource.cancel":
        fetches.get(id)?.abort();
        fetches.delete(id);
        return;
    }
  };

  return {
    receive: (data) => {
      if (disposed || !isRecord(data) || typeof data.type !== "string") return;
      const message = data as Message;
      const domain = message.type.split(".")[0] ?? "";
      if (!exposed.has(domain)) return;
      if (domain === "shell") return handleShell(message);
      // 結果を返す要求は `id` で突き合わせる。無いものは答えようがない。購読は `subId` で扱う。
      const bySubId = /^(relay|outbox)\.(subscribe|close)$/.test(message.type);
      if (!bySubId && typeof message.id !== "string") return;
      switch (domain) {
        case "theme":
          return handleTheme(message);
        case "identity":
          return handleIdentity(message);
        case "storage":
          return handleStorage(message);
        case "relay":
          return handleRelay(message);
        case "outbox":
          return handleOutbox(message);
        case "resource":
          return handleResource(message);
      }
    },
    themeChanged: () => {
      if (exposed.has("theme"))
        send({ type: "theme.changed", theme: host.theme() });
    },
    identityChanged: () => {
      if (exposed.has("identity")) {
        send({ type: "identity.changed", pubkey: host.publicKey() });
      }
    },
    dispose: () => {
      for (const close of subscriptions.values()) close();
      subscriptions.clear();
      for (const stop of queries) stop();
      queries.clear();
      for (const controller of fetches.values()) controller.abort();
      fetches.clear();
      disposed = true;
    },
  };
};
